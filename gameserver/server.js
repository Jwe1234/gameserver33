// ===============================
// GAMEVERSE - GENERADOR DE APK
// SERVIDOR NODE.JS COMPLETO CON BD COMPARTIDA
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
const dataFolder = path.join(__dirname, "data");

fs.ensureDirSync(uploadFolder);
fs.ensureDirSync(tempFolder);
fs.ensureDirSync(apksFolder);
fs.ensureDirSync(logsFolder);
fs.ensureDirSync(dataFolder);

// ===============================
// ARCHIVO DE BASE DE DATOS
// ===============================

const DB_FILE = path.join(dataFolder, "database.json");

function cargarDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.log("Error cargando DB:", e.message);
    }
    return { usuarios: {}, apps: [] };
}

function guardarDB(db) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        return true;
    } catch (e) {
        console.log("Error guardando DB:", e.message);
        return false;
    }
}

// Servir archivos estáticos
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
        fileSize: 500 * 1024 * 1024,
        files: 100
    }
});

// ===============================
// MIDDLEWARE
// ===============================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

// ===============================
// RUTAS DE USUARIOS Y JUEGOS (BASE DE DATOS COMPARTIDA)
// ===============================

// Obtener todos los datos (usuarios + juegos)
app.get("/api/datos", (req, res) => {
    const db = cargarDB();
    res.json({
        success: true,
        usuarios: db.usuarios,
        apps: db.apps
    });
});

// Registrar usuario
app.post("/api/registrar", (req, res) => {
    const { usuario, password, avatar } = req.body;
    
    if (!usuario || !password) {
        return res.status(400).json({ 
            success: false, 
            error: "Usuario y contraseña son obligatorios" 
        });
    }
    
    const db = cargarDB();
    
    // Verificar si el usuario ya existe
    for (let key in db.usuarios) {
        if (db.usuarios[key].nombre.toLowerCase() === usuario.toLowerCase()) {
            return res.status(400).json({ 
                success: false, 
                error: "El usuario ya existe" 
            });
        }
    }
    
    const id = "user_" + Date.now();
    db.usuarios[id] = {
        id: id,
        nombre: usuario,
        password: password,
        avatar: avatar || "😎",
        appsCreadas: []
    };
    
    if (guardarDB(db)) {
        res.json({
            success: true,
            usuario: db.usuarios[id],
            sesion: id
        });
    } else {
        res.status(500).json({ 
            success: false, 
            error: "Error al guardar usuario" 
        });
    }
});

// Iniciar sesión
app.post("/api/login", (req, res) => {
    const { usuario, password } = req.body;
    
    if (!usuario || !password) {
        return res.status(400).json({ 
            success: false, 
            error: "Usuario y contraseña son obligatorios" 
        });
    }
    
    const db = cargarDB();
    
    for (let key in db.usuarios) {
        if (db.usuarios[key].nombre.toLowerCase() === usuario.toLowerCase()) {
            if (db.usuarios[key].password === password) {
                return res.json({
                    success: true,
                    usuario: db.usuarios[key],
                    sesion: key
                });
            } else {
                return res.status(401).json({ 
                    success: false, 
                    error: "Contraseña incorrecta" 
                });
            }
        }
    }
    
    res.status(404).json({ 
        success: false, 
        error: "Usuario no encontrado" 
    });
});

// Actualizar usuario
app.put("/api/usuario/:id", (req, res) => {
    const { id } = req.params;
    const { nombre, avatar, password } = req.body;
    
    const db = cargarDB();
    
    if (!db.usuarios[id]) {
        return res.status(404).json({ 
            success: false, 
            error: "Usuario no encontrado" 
        });
    }
    
    if (nombre) db.usuarios[id].nombre = nombre;
    if (avatar) db.usuarios[id].avatar = avatar;
    if (password) db.usuarios[id].password = password;
    
    if (guardarDB(db)) {
        res.json({
            success: true,
            usuario: db.usuarios[id]
        });
    } else {
        res.status(500).json({ 
            success: false, 
            error: "Error al actualizar usuario" 
        });
    }
});

// Publicar juego
app.post("/api/publicar", (req, res) => {
    const { usuarioId, nombre, version, genero, descripcion, apkUrl } = req.body;
    
    if (!usuarioId || !nombre || !apkUrl) {
        return res.status(400).json({ 
            success: false, 
            error: "Faltan datos obligatorios" 
        });
    }
    
    const db = cargarDB();
    
    if (!db.usuarios[usuarioId]) {
        return res.status(404).json({ 
            success: false, 
            error: "Usuario no encontrado" 
        });
    }
    
    const app = {
        id: "app_" + Date.now(),
        nombre: nombre,
        version: version || "1.0.0",
        genero: genero || "Otro",
        descripcion: descripcion || "",
        autor: db.usuarios[usuarioId].nombre,
        autorId: usuarioId,
        fecha: Date.now(),
        apkUrl: apkUrl
    };
    
    db.apps.unshift(app);
    db.usuarios[usuarioId].appsCreadas.unshift(app);
    
    if (guardarDB(db)) {
        res.json({
            success: true,
            app: app
        });
    } else {
        res.status(500).json({ 
            success: false, 
            error: "Error al publicar juego" 
        });
    }
});

// Eliminar juego
app.delete("/api/app/:id", (req, res) => {
    const { id } = req.params;
    const { usuarioId } = req.body;
    
    const db = cargarDB();
    
    // Eliminar de apps globales
    db.apps = db.apps.filter(x => x.id !== id);
    
    // Eliminar de las apps del usuario
    if (usuarioId && db.usuarios[usuarioId]) {
        db.usuarios[usuarioId].appsCreadas = 
            db.usuarios[usuarioId].appsCreadas.filter(x => x.id !== id);
    }
    
    if (guardarDB(db)) {
        res.json({ success: true });
    } else {
        res.status(500).json({ 
            success: false, 
            error: "Error al eliminar juego" 
        });
    }
});

// ===============================
// RUTA: ESTADO DEL SERVIDOR
// ===============================

app.get("/api/estado", (req, res) => {
    const db = cargarDB();
    res.json({
        online: true,
        timestamp: Date.now(),
        version: "2.0.0",
        usuarios: Object.keys(db.usuarios).length,
        apps: db.apps.length
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
// RUTAS DE SEGURIDAD (LAS MISMAS QUE ANTES)
// ===============================

function limpiarNombreArchivo(nombre) {
    return nombre.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function validarArchivoSeguro(archivo) {
    const peligrosos = [".exe", ".bat", ".cmd", ".msi", ".sh", ".ps1", ".com", ".scr", ".vbs", ".jar"];
    const extension = path.extname(archivo.originalname).toLowerCase();
    return !peligrosos.includes(extension);
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

async function guardarAPKFinal(apkOriginal, nombre, version) {
    await fs.ensureDir(apksFolder);
    let nombreLimpio = nombre.replace(/[^a-zA-Z0-9]/g, "_");
    const nuevoNombre = nombreLimpio + "_v" + version + ".apk";
    const destino = path.join(apksFolder, nuevoNombre);
    await fs.copy(apkOriginal, destino);
    return { ruta: destino, nombre: nuevoNombre };
}

async function guardarLog(contenido) {
    await fs.ensureDir(logsFolder);
    const archivo = path.join(logsFolder, "compilacion_" + Date.now() + ".txt");
    await fs.outputFile(archivo, contenido);
    return archivo;
}

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

// ===============================
// CREAR PROYECTO ANDROID
// ===============================

async function crearArchivosGradle(android, paquete, nombre) {
    const javaPath = path.join(android, "app", "src", "main", "java", paquete.replaceAll(".", "/"));
    await fs.ensureDir(javaPath);

    await fs.outputFile(path.join(android, "local.properties"), `sdk.dir=/usr/lib/android-sdk`);

    await fs.outputFile(path.join(android, "gradle.properties"),
        `org.gradle.jvmargs=-Xmx1024m -Dfile.encoding=UTF-8
org.gradle.daemon=false
org.gradle.workers.max=1
org.gradle.parallel=false
org.gradle.caching=false
android.useAndroidX=true
android.enableJetifier=true
kotlin.stdlib.default.dependency=false`
    );

    await fs.outputFile(path.join(android, "settings.gradle"),
        `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
        maven { url 'https://maven.aliyun.com/repository/public' }
        maven { url 'https://maven.aliyun.com/repository/google' }
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url 'https://maven.aliyun.com/repository/public' }
        maven { url 'https://maven.aliyun.com/repository/google' }
    }
}

rootProject.name = "${nombre}"
include ':app'`
    );

    await fs.outputFile(path.join(android, "build.gradle"),
        `buildscript {
    repositories {
        google()
        mavenCentral()
        maven { url 'https://maven.aliyun.com/repository/public' }
        maven { url 'https://maven.aliyun.com/repository/google' }
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.1.4'
    }
}

plugins {
    id 'com.android.application' version '8.1.4' apply false
}`
    );

    await fs.outputFile(path.join(android, "app", "build.gradle"),
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
    
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'androidx.webkit:webkit:1.9.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'
}`
    );

    await fs.outputFile(path.join(javaPath, "MainActivity.java"),
        `package ${paquete};

import androidx.appcompat.app.AppCompatActivity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;

public class MainActivity extends AppCompatActivity {

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

async function crearRecursosAndroid(android) {
    const resFolder = path.join(android, "app", "src", "main", "res");
    const values = path.join(resFolder, "values");
    const drawable = path.join(resFolder, "drawable");
    await fs.ensureDir(values);
    await fs.ensureDir(drawable);

    await fs.outputFile(path.join(values, "colors.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="purple">#7C5CFC</color>
    <color name="black">#000000</color>
    <color name="white">#FFFFFF</color>
</resources>`
    );

    await fs.outputFile(path.join(values, "styles.xml"),
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

async function colocarIconoAPK(android, archivos) {
    const iconos = archivos.filter(archivo => {
        const ext = path.extname(archivo.originalname).toLowerCase();
        return [".png", ".jpg", ".jpeg"].includes(ext);
    });
    if (!iconos.length) {
        console.log("⚠️ No se encontró icono, continuando sin icono");
        return;
    }
    const icono = iconos[0];
    const drawable = path.join(android, "app", "src", "main", "res", "drawable");
    await fs.ensureDir(drawable);
    await fs.copy(icono.path, path.join(drawable, "app_icon.png"));
    console.log("✅ Icono colocado:", icono.originalname);
}

async function crearProyectoAndroid(carpetaProyecto, nombre, paquete, version) {
    const android = path.join(carpetaProyecto, "android");
    const app = path.join(android, "app");
    const assets = path.join(app, "src", "main", "assets");
    await fs.ensureDir(assets);

    const archivos = await fs.readdir(carpetaProyecto);
    for (let archivo of archivos) {
        if (archivo !== "android") {
            await fs.copy(path.join(carpetaProyecto, archivo), path.join(assets, archivo));
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

    await fs.outputFile(path.join(app, "src", "main", "AndroidManifest.xml"), manifest);
    return android;
}

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

function compilarAPK(androidPath) {
    return new Promise((resolve, reject) => {
        const gradleCommand = `cd "${androidPath}" && gradle assembleDebug --stacktrace --info --no-daemon --max-workers=1`;
        exec(gradleCommand, {
            env: {
                ...process.env,
                _JAVA_OPTIONS: "-Xmx1024m",
                GRADLE_OPTS: "-Xmx1024m -Dorg.gradle.daemon=false"
            },
            maxBuffer: 1024 * 1024 * 10
        }, async (error, stdout, stderr) => {
            console.log("STDOUT:");
            console.log(stdout ? stdout.slice(-5000) : "");
            console.log("STDERR:");
            console.log(stderr ? stderr.slice(-5000) : "");

            if (error) {
                console.log("ERROR GRADLE:");
                console.log(stderr || error.message);
                reject({
                    mensaje: "Error compilando APK",
                    detalle: stdout + "\n\n" + stderr + "\n\n" + error.message
                });
                return;
            }
            console.log("APK creado correctamente");
            let log = `========== GAMEVERSE APK LOG ==========\nFECHA: ${new Date().toISOString()}\nSALIDA: ${stdout}\n=======================================\n`;
            await guardarLog(log);
            resolve({ apk: true });
        });
    });
}

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
            return res.status(400).json({ error: "No se recibieron archivos" });
        }

        console.log(`📦 Archivos recibidos: ${req.files.length}`);
        console.log(`📱 App: ${nombre} | ${paquete} | v${version}`);

        const archivosSeguros = await protegerArchivos(req.files);
        if (archivosSeguros.length === 0) {
            return res.status(400).json({ error: "No se encontraron archivos válidos" });
        }

        const proyecto = await prepararAPK(archivosSeguros, nombre, paquete, version);
        console.log("🔨 Compilando APK...");
        await compilarAPK(proyecto);

        const apkGenerada = path.join(proyecto, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
        if (!fs.existsSync(apkGenerada)) {
            return res.status(500).json({ error: "APK no encontrada después de la compilación" });
        }

        const apkFinal = await guardarAPKFinal(apkGenerada, nombre, version);
        const protocolo = req.headers["x-forwarded-proto"] || "http";
        const baseUrl = req.headers.host ? `${protocolo}://${req.headers.host}` : `http://localhost:${PORT}`;
        const urlDescarga = `${baseUrl}/descargas/${apkFinal.nombre}`;

        console.log(`✅ APK generada: ${apkFinal.ruta}`);
        console.log(`🔗 URL de descarga: ${urlDescarga}`);

        res.json({
            exito: true,
            mensaje: "APK generada correctamente",
            url: urlDescarga,
            nombre: apkFinal.nombre
        });

        setTimeout(() => { limpiarCarpeta(proyecto); }, 5000);
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({
            error: error.mensaje || error.message || "Error interno del servidor",
            detalle: error.detalle || ""
        });
    }
});

// ===============================
// LIMPIEZA AUTOMÁTICA
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
// MANEJO DE ERRORES
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
    console.log("🚀 GameVerse APK Server v2.0 iniciado");
    console.log("🌐 Puerto:", PORT);
    console.log("=================================");
});