// ===============================
// GAMEVERSE - GENERADOR DE APK
// SERVIDOR NODE.JS COMPLETO
// ===============================

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");
const AdmZip = require("adm-zip");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// CONFIGURACIÓN DE CARPETAS
// ===============================

const uploadFolder = path.join(__dirname, "uploads");
const tempFolder = path.join(__dirname, "temp");
const apksFolder = path.join(__dirname, "apks");
const logsFolder = path.join(__dirname, "logs");

fs.ensureDirSync(uploadFolder);
fs.ensureDirSync(tempFolder);
fs.ensureDirSync(apksFolder);
fs.ensureDirSync(logsFolder);

// Servir archivos estáticos de la carpeta apks
app.use('/descargas', express.static(apksFolder));

// ===============================
// CONFIGURACIÓN MULTER
// ===============================

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadFolder);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB
        files: 100
    }
});

// ===============================
// MIDDLEWARE
// ===============================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS para desarrollo
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

// ===============================
// RUTA PRINCIPAL (RAÍZ)
// ===============================

app.get("/", (req, res) => {
    res.send("GameVerse Server funcionando");
});

// ===============================
// FUNCIONES DE SEGURIDAD
// ===============================

function limpiarNombreArchivo(nombre) {
    return nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function validarArchivoSeguro(archivo) {
    const peligrosos = [
        ".exe", ".bat", ".cmd", ".msi", ".sh", ".ps1",
        ".com", ".scr", ".vbs", ".jar"
    ];

    const extension = path.extname(archivo.originalname).toLowerCase();

    if (peligrosos.includes(extension)) {
        return false;
    }

    return true;
}

async function protegerArchivos(archivos) {
    let seguros = [];

    for (let archivo of archivos) {
        if (validarArchivoSeguro(archivo)) {
            archivo.originalname = limpiarNombreArchivo(archivo.originalname);
            seguros.push(archivo);
        }
    }

    return seguros;
}

// ===============================
// FUNCIONES AUXILIARES
// ===============================

async function limpiarCarpeta(carpeta) {
    try {
        if (await fs.pathExists(carpeta)) {
            await fs.remove(carpeta);
            console.log("🧹 Carpeta eliminada:", carpeta);
        }
    } catch (error) {
        console.log("Error limpiando:", error.message);
    }
}

async function guardarLog(contenido) {
    await fs.ensureDir(logsFolder);

    const archivo = path.join(
        logsFolder,
        "compilacion_" + Date.now() + ".txt"
    );

    await fs.outputFile(archivo, contenido);
    return archivo;
}

async function guardarAPKFinal(apkOriginal, nombre, version) {
    await fs.ensureDir(apksFolder);

    let nombreLimpio = nombre.replace(/[^a-zA-Z0-9]/g, "_");
    const nuevoNombre = nombreLimpio + "_v" + version + ".apk";
    const destino = path.join(apksFolder, nuevoNombre);

    await fs.copy(apkOriginal, destino);
    return { ruta: destino, nombre: nuevoNombre };
}

// ===============================
// DETECTAR TIPO DE PROYECTO
// ===============================

async function detectarProyecto(carpeta) {
    let archivos = await fs.readdir(carpeta, { recursive: true });
    let lista = archivos.map(x => x.toLowerCase());

    if (lista.some(x => x.includes("projectsettings"))) {
        return "unity";
    }

    if (lista.some(x => x.includes("project.godot"))) {
        return "godot";
    }

    if (lista.some(x => x.endsWith(".html"))) {
        return "web";
    }

    return "desconocido";
}

// ===============================
// PREPARAR SEGÚN TIPO
// ===============================

async function prepararSegunTipo(tipo, carpeta) {
    switch (tipo) {
        case "web":
            console.log("🌐 Preparando proyecto Web");
            return { tipo: "web", carpeta: carpeta };

        case "unity":
            console.log("🎮 Proyecto Unity detectado");
            return { tipo: "unity", carpeta: carpeta };

        case "godot":
            console.log("🎮 Proyecto Godot detectado");
            return { tipo: "godot", carpeta: carpeta };

        default:
            console.log("📦 Proyecto desconocido");
            return { tipo: "desconocido", carpeta: carpeta };
    }
}

// ===============================
// PREPARAR PROYECTO
// ===============================

async function prepararProyecto(archivos) {
    const carpetaProyecto = path.join(tempFolder, "proyecto_" + Date.now());
    await fs.ensureDir(carpetaProyecto);

    for (const archivo of archivos) {
        let extension = path.extname(archivo.originalname).toLowerCase();

        if (extension === ".zip") {
            const zip = new AdmZip(archivo.path);
            zip.extractAllTo(carpetaProyecto, true);
        } else {
            await fs.copy(
                archivo.path,
                path.join(carpetaProyecto, archivo.originalname)
            );
        }
    }

    return carpetaProyecto;
}

// ===============================
// CREAR PROYECTO ANDROID
// ===============================

async function crearProyectoAndroid(carpetaProyecto, nombre, paquete, version) {
    const android = path.join(carpetaProyecto, "android");
    const app = path.join(android, "app");
    const assets = path.join(app, "src", "main", "assets");

    await fs.ensureDir(assets);

    const archivos = await fs.readdir(carpetaProyecto);

    for (let archivo of archivos) {
        if (archivo !== "android") {
            await fs.copy(
                path.join(carpetaProyecto, archivo),
                path.join(assets, archivo)
            );
        }
    }

    const manifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${paquete}">

    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>

    <application
        android:theme="@style/AppTheme"
        android:label="${nombre}"
        android:allowBackup="true"
        android:supportsRtl="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">

            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>

        </activity>

    </application>

</manifest>`;

    await fs.outputFile(
        path.join(app, "src", "main", "AndroidManifest.xml"),
        manifest
    );

    return android;
}

// ===============================
// CREAR RECURSOS ANDROID
// ===============================

async function crearRecursosAndroid(android) {
    const resFolder = path.join(android, "app", "src", "main", "res");
    const values = path.join(resFolder, "values");
    const drawable = path.join(resFolder, "drawable");

    await fs.ensureDir(values);
    await fs.ensureDir(drawable);

    await fs.outputFile(
        path.join(values, "colors.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="purple">#7C5CFC</color>
    <color name="black">#000000</color>
    <color name="white">#FFFFFF</color>
</resources>`
    );

    await fs.outputFile(
        path.join(values, "styles.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar">
        <item name="android:fontFamily">sans-serif</item>
        <item name="android:colorAccent">@color/purple</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:statusBarColor">@color/white</item>
    </style>
</resources>`
    );
}

// ===============================
// COLOCAR ICONO
// ===============================

async function colocarIconoAPK(android, archivos) {

    const iconos = archivos.filter(
        archivo => {
            const ext = path.extname(archivo.originalname).toLowerCase();
            return [".png", ".jpg", ".jpeg"].includes(ext);
        }
    );

    if (!iconos.length) {
        console.log("⚠️ No se encontró icono, continuando sin icono");
        return;
    }

    const icono = iconos[0];

    const drawable = path.join(
        android,
        "app",
        "src",
        "main",
        "res",
        "drawable"
    );

    await fs.ensureDir(drawable);

    await fs.copy(
        icono.path,
        path.join(drawable, "app_icon.png")
    );

    console.log("✅ Icono colocado:", icono.originalname);
}

// ===============================
// CREAR ARCHIVOS GRADLE
// ===============================

async function crearArchivosGradle(android, paquete, nombre) {
    const javaPath = path.join(
        android,
        "app",
        "src",
        "main",
        "java",
        paquete.replaceAll(".", "/")
    );

    await fs.ensureDir(javaPath);

    // local.properties
    await fs.outputFile(
        path.join(android, "local.properties"),
        `sdk.dir=/usr/lib/android-sdk`
    );

    // gradle.properties
    await fs.outputFile(
        path.join(android, "gradle.properties"),
        `org.gradle.jvmargs=-Xmx768m -XX:MaxMetaspaceSize=256m -Dfile.encoding=UTF-8
org.gradle.daemon=false
org.gradle.workers.max=1
org.gradle.parallel=false
org.gradle.caching=false
org.gradle.configuration-cache=false
android.useAndroidX=true
android.enableJetifier=true`
    );

    // settings.gradle
    await fs.outputFile(
        path.join(android, "settings.gradle"),
        `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "${nombre}"
include ':app'`
    );

    // build.gradle (raíz)
    await fs.outputFile(
        path.join(android, "build.gradle"),
        `plugins {
    id 'com.android.application' version '8.1.4' apply false
}`
    );

    // app/build.gradle
    await fs.outputFile(
        path.join(android, "app", "build.gradle"),
        `plugins {
    id 'com.android.application'
}

android {
    namespace '${paquete}'
    compileSdk 34

    defaultConfig {
        applicationId '${paquete}'
        minSdk 23
        targetSdk 34
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            minifyEnabled false
        }
    }
}

dependencies {
    implementation 'androidx.webkit:webkit:1.9.0'
}`
    );

    // MainActivity.java
    await fs.outputFile(
        path.join(javaPath, "MainActivity.java"),
        `package ${paquete};

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView web = new WebView(this);
        WebSettings settings = web.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);

        web.setWebViewClient(new WebViewClient());
        web.loadUrl("file:///android_asset/index.html");

        setContentView(web);
    }

}`
    );
}

// ===============================
// COMPILAR APK CON LOG
// ===============================

function compilarAPK(androidPath) {
    return new Promise((resolve, reject) => {

        const gradleCommand = `cd "${androidPath}" && gradle assembleDebug --no-daemon --stacktrace --no-parallel`;

        exec(gradleCommand, {
            env: {
                ...process.env,
                _JAVA_OPTIONS: "-Xmx768m -XX:MaxMetaspaceSize=256m",
                GRADLE_OPTS: "-Xmx768m -Dorg.gradle.daemon=false -Dorg.gradle.workers.max=1"
            },
            maxBuffer: 1024 * 1024 * 10
        }, async (error, stdout, stderr) => {

            if (error) {
                console.log("ERROR GRADLE:");
                console.log(stderr || error.message);
                
                reject({
                    mensaje: "Error compilando APK",
                    detalle: stderr || error.message
                });
                return;
            }

            console.log("APK creado correctamente");
            
            let log = `
========== GAMEVERSE APK LOG ==========
FECHA: ${new Date().toISOString()}
SALIDA: ${stdout}
=======================================
`;
            await guardarLog(log);

            resolve({ apk: true });
        });
    });
}

// ===============================
// PROCESO COMPLETO: prepararAPK
// ===============================

async function prepararAPK(archivos, nombre, paquete, version) {
    const carpetaBase = path.join(tempFolder, "build_" + Date.now());
    await fs.ensureDir(carpetaBase);

    for (let archivo of archivos) {
        let destino = path.join(carpetaBase, archivo.originalname);

        if (archivo.originalname.toLowerCase().endsWith(".zip")) {
            const zip = new AdmZip(archivo.path);
            zip.extractAllTo(carpetaBase, true);
        } else {
            await fs.copy(archivo.path, destino);
        }
    }

    const android = await crearProyectoAndroid(carpetaBase, nombre, paquete, version);
    await crearRecursosAndroid(android);
    await colocarIconoAPK(android, archivos);
    await crearArchivosGradle(android, paquete, nombre);

    return android;
}

// ===============================
// RUTA: ESTADO DEL SERVIDOR
// ===============================

app.get("/api/estado", (req, res) => {
    res.json({
        online: true,
        timestamp: Date.now(),
        version: "1.0.0"
    });
});

// ===============================
// RUTA: DIAGNÓSTICO
// ===============================

function ejecutarComando(comando) {
    return new Promise((resolve) => {
        exec(comando, (error, stdout, stderr) => {
            if (error) {
                resolve({
                    ok: false,
                    error: stderr || error.message
                });
            } else {
                resolve({
                    ok: true,
                    resultado: stdout
                });
            }
        });
    });
}

app.get("/api/diagnostico", async (req, res) => {
    const java = await ejecutarComando("java -version");
    const gradle = await ejecutarComando("gradle -v");
    const adb = await ejecutarComando("adb version");

    res.json({
        servidor: true,
        java: java,
        gradle: gradle,
        androidSDK: adb
    });
});

// ===============================
// RUTA: MEMORIA
// ===============================

app.get("/api/memoria", (req, res) => {
    const os = require("os");

    res.json({
        totalMB: Math.round(os.totalmem() / 1024 / 1024),
        libreMB: Math.round(os.freemem() / 1024 / 1024),
        nodeHeapMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        nodeUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    });
});

// ===============================
// RUTA PRINCIPAL: GENERAR APK
// ===============================

app.post("/api/generar-apk", (req, res, next) => {
    console.log("RUTA GENERAR APK EJECUTADA");
    upload.any()(req, res, (err) => {
        if (err) {
            console.error("❌ Error middleware:", err.message);
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        const nombre = req.body.nombre || "GameVerse";
        const paquete = req.body.paquete || "com.gameverse.app";
        const version = req.body.version || "1.0.0";

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: "No se recibieron archivos"
            });
        }

        console.log(`📦 Archivos recibidos: ${req.files.length}`);
        console.log(`📱 App: ${nombre} | ${paquete} | v${version}`);

        const archivosSeguros = await protegerArchivos(req.files);

        if (archivosSeguros.length === 0) {
            return res.status(400).json({
                error: "No se encontraron archivos válidos"
            });
        }

        const proyecto = await prepararAPK(
            archivosSeguros,
            nombre,
            paquete,
            version
        );

        console.log("🔨 Compilando APK...");

        await compilarAPK(proyecto);

        const apkGenerada = path.join(
            proyecto,
            "app",
            "build",
            "outputs",
            "apk",
            "debug",
            "app-debug.apk"
        );

        if (!fs.existsSync(apkGenerada)) {
            return res.status(500).json({
                error: "APK no encontrada después de la compilación"
            });
        }

        const apkFinal = await guardarAPKFinal(apkGenerada, nombre, version);
        
        // Detectar la URL base correctamente según el entorno
        const protocolo = req.headers["x-forwarded-proto"] || "http";
        
        const baseUrl = req.headers.host
            ? `${protocolo}://${req.headers.host}`
            : `http://localhost:${PORT}`;
        
        const urlDescarga = `${baseUrl}/descargas/${apkFinal.nombre}`;

        console.log(`✅ APK generada: ${apkFinal.ruta}`);
        console.log(`🔗 URL de descarga: ${urlDescarga}`);

        // Enviar respuesta JSON con la URL de descarga
        res.json({
            exito: true,
            mensaje: "APK generada correctamente",
            url: urlDescarga,
            nombre: apkFinal.nombre
        });

        // Limpiar carpeta temporal después
        setTimeout(() => {
            limpiarCarpeta(proyecto);
        }, 5000);

    } catch (error) {
        console.error("❌ Error:", error);

        res.status(500).json({
            error: error.mensaje || error.message || "Error interno del servidor",
            detalle: error.detalle || ""
        });
    }
});

// ===============================
// LIMPIEZA AUTOMÁTICA (CADA HORA)
// ===============================

setInterval(async () => {
    try {
        if (await fs.pathExists(tempFolder)) {
            const carpetas = await fs.readdir(tempFolder);

            for (let carpeta of carpetas) {
                const ruta = path.join(tempFolder, carpeta);
                const info = await fs.stat(ruta);
                const tiempo = Date.now() - info.mtimeMs;

                if (tiempo > 60 * 60 * 1000) {
                    await limpiarCarpeta(ruta);
                }
            }
        }
    } catch (error) {
        console.log("Error en limpieza:", error.message);
    }
}, 60 * 60 * 1000);

// ===============================
// MANEJO DE ERRORES GLOBALES
// ===============================

process.on("uncaughtException", (error) => {
    console.log("❌ Error inesperado:", error.message);
});

process.on("unhandledRejection", (error) => {
    console.log("❌ Promesa fallida:", error);
});

// ===============================
// INICIO DEL SERVIDOR
// ===============================

app.listen(PORT, "0.0.0.0", () => {
    console.log("=================================");
    console.log("🚀 GameVerse APK Server iniciado");
    console.log("🌐 Puerto:", PORT);
    console.log("=================================");
});