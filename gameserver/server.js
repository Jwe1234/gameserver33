const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const archiver = require('archiver');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de almacenamiento
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = crypto.randomBytes(16).toString('hex');
        cb(null, `${uniqueName}-${file.originalname}`);
    }
});

// Límites optimizados
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 20
    }
});

// Función para guardar logs
async function guardarLog(mensaje) {
    const logDir = path.join(__dirname, 'logs');
    await fs.ensureDir(logDir);
    const logPath = path.join(logDir, `log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    await fs.writeFile(logPath, mensaje);
}

// Función para limpiar carpetas
async function limpiarCarpeta(ruta) {
    try {
        if (await fs.pathExists(ruta)) {
            await fs.remove(ruta);
            console.log(`Carpeta limpiada: ${ruta}`);
        }
    } catch (error) {
        console.error(`Error limpiando carpeta ${ruta}:`, error);
    }
}

// Función para crear archivos gradle
async function crearArchivosGradle(androidPath) {
    try {
        // build.gradle (raíz)
        const buildGradle = `
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:7.4.2'
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`;

        // gradle.properties con memoria reducida
        const gradleProperties = `
org.gradle.jvmargs=-Xmx384m -XX:MaxMetaspaceSize=64m -Dfile.encoding=UTF-8

org.gradle.daemon=false
org.gradle.workers.max=1
org.gradle.parallel=false
org.gradle.caching=false
org.gradle.configuration-cache=false
org.gradle.vfs.watch=false

android.useAndroidX=true
android.enableJetifier=true
`;

        // settings.gradle
        const settingsGradle = `
rootProject.name = "Gameverse"
include ':app'
`;

        // AndroidManifest.xml con icono por defecto
        const manifest = `
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:icon="@android:drawable/sym_def_app_icon"
        android:label="Gameverse"
        android:theme="@style/Theme.AppCompat.Light">
        <activity 
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;

        // Crear estructura de carpetas
        const appPath = path.join(androidPath, 'app');
        const srcPath = path.join(appPath, 'src', 'main');
        const javaPath = path.join(srcPath, 'java', 'com', 'gameverse', 'app');
        
        await fs.ensureDir(javaPath);
        
        // Escribir archivos raíz
        await fs.writeFile(path.join(androidPath, 'build.gradle'), buildGradle);
        await fs.writeFile(path.join(androidPath, 'gradle.properties'), gradleProperties);
        await fs.writeFile(path.join(androidPath, 'settings.gradle'), settingsGradle);
        await fs.writeFile(path.join(srcPath, 'AndroidManifest.xml'), manifest);
        
        // app/build.gradle con SDK 34
        const appGradle = `
plugins {
    id 'com.android.application'
}

android {
    namespace "com.gameverse.app"
    compileSdk 34

    defaultConfig {
        applicationId "com.gameverse.app"
        minSdk 21
        targetSdk 34
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        debug {
            minifyEnabled false
        }
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
}
`;

        await fs.writeFile(
            path.join(androidPath, 'app', 'build.gradle'),
            appGradle
        );
        
        // MainActivity.java
        const mainActivity = `
package com.gameverse.app;

import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
    }
}
`;
        await fs.writeFile(path.join(javaPath, 'MainActivity.java'), mainActivity);
        
        // layout
        const layoutPath = path.join(srcPath, 'res', 'layout');
        await fs.ensureDir(layoutPath);
        
        const layout = `
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center">
    
    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Gameverse App"
        android:textSize="24sp"
        android:textStyle="bold"/>
</LinearLayout>
`;
        await fs.writeFile(path.join(layoutPath, 'activity_main.xml'), layout);
        
        // styles.xml
        const valuesPath = path.join(srcPath, 'res', 'values');
        await fs.ensureDir(valuesPath);
        
        const styles = `
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.AppCompat.Light" parent="android:style/Theme.Material.Light.NoActionBar">
    </style>
</resources>
`;
        
        await fs.writeFile(
            path.join(valuesPath, 'styles.xml'),
            styles
        );
        
        return true;
    } catch (error) {
        console.error('Error creando archivos gradle:', error);
        throw error;
    }
}

// Función compilarAPK con memoria reducida
function compilarAPK(androidPath) {
    return new Promise((resolve, reject) => {

        const gradleCommand = `cd "${androidPath}" && gradle assembleDebug --no-daemon --no-parallel --max-workers=1 --no-watch-fs`;

        exec(gradleCommand, {
            env: {
                ...process.env,
                _JAVA_OPTIONS: "-Xmx384m -XX:MaxMetaspaceSize=64m",
                GRADLE_OPTS: "-Xmx384m -XX:MaxMetaspaceSize=64m -Dorg.gradle.daemon=false -Dorg.gradle.workers.max=1"
            },

            maxBuffer: 1024 * 1024 * 2

        }, async (error, stdout, stderr) => {

            if (error) {

                console.log("ERROR GRADLE:");
                console.log(stderr || error.message);

                reject({
                    mensaje:"Error compilando APK",
                    detalle:stderr || error.message
                });

                return;
            }

            console.log("APK creada correctamente");

            await guardarLog(`
========== GAMEVERSE APK LOG ==========
FECHA: ${new Date().toISOString()}

SALIDA:
${stdout}

=======================================
`);

            resolve({
                apk:true
            });

        });

    });
}

// Función prepararAPK
async function prepararAPK(archivos) {
    const projectId = crypto.randomBytes(8).toString('hex');
    const proyectoPath = path.join(__dirname, 'proyectos', projectId);
    const androidPath = path.join(proyectoPath, 'android');

    try {
        await fs.ensureDir(androidPath);
        
        // Crear archivos de Android
        await crearArchivosGradle(androidPath);
        
        // Mover archivos subidos
        const assetsPath = path.join(androidPath, 'app', 'src', 'main', 'assets');
        await fs.ensureDir(assetsPath);
        
        for (const archivo of archivos) {
            const destino = path.join(assetsPath, archivo.originalname);
            await fs.copy(archivo.path, destino);
            await fs.remove(archivo.path);
        }
        
        // Compilar APK
        const resultado = await compilarAPK(androidPath);
        
        // Buscar APK generado
        const apkPath = path.join(androidPath, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
        
        if (await fs.pathExists(apkPath)) {
            const apkName = `gameverse-${projectId}.apk`;
            const apkDestino = path.join(__dirname, 'apks', apkName);
            await fs.ensureDir(path.join(__dirname, 'apks'));
            await fs.copy(apkPath, apkDestino);
            
            // Limpieza diferida (30 segundos)
            setTimeout(() => {
                limpiarCarpeta(proyectoPath);
            }, 30000);
            
            return {
                success: true,
                apkPath: `/apks/${apkName}`,
                projectId: projectId
            };
        } else {
            throw new Error('No se encontró el APK generado');
        }
    } catch (error) {
        console.error('Error en prepararAPK:', error);
        await limpiarCarpeta(proyectoPath);
        throw error;
    }
}

// Rutas
app.post('/api/compile', upload.array('files'), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'No se subieron archivos'
            });
        }
        
        console.log(`Recibidos ${req.files.length} archivos`);
        
        const resultado = await prepararAPK(req.files);
        
        res.json({
            success: true,
            apkUrl: resultado.apkPath,
            projectId: resultado.projectId
        });
        
    } catch (error) {
        console.error('Error en /api/compile:', error);
        res.status(500).json({
            error: 'Error compilando APK',
            detalle: error.message
        });
    }
});

// Ruta para descargar APK
app.get('/apks/:filename', async (req, res) => {
    try {
        const filePath = path.join(__dirname, 'apks', req.params.filename);
        
        if (await fs.pathExists(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).json({ error: 'APK no encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error descargando APK' });
    }
});

// Ruta de salud
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        memory: process.memoryUsage()
    });
});

// Monitoreo de memoria
setInterval(() => {
    console.log("Memoria usada:",
        Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        "MB");
}, 30000);

// Iniciar servidor
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Gameverse Server running on port ${PORT}`);
    console.log(`📊 Memory limit: 512MB (Node.js)`);
    console.log(`📦 Gradle memory: 384MB`);
    console.log(`⚙️  Workers: 1 | No parallel`);
});

module.exports = app;