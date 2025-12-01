import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

// --- WARNA TEMA ---
const DARK_BG = 0x111111;
const LIGHT_BG = 0xf0f0f0; 

// --- SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(DARK_BG);
scene.fog = new THREE.Fog(DARK_BG, 5, 15);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// MATIKAN MENU KLIK KANAN
window.addEventListener('contextmenu', (e) => e.preventDefault());

// --- LIGHTS ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(3, 5, 3);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
scene.add(dirLight);

// --- LANTAI & GRID (UPDATE: GRID KEMBALI & DINAMIS) ---
let gridHelper;

// Fungsi untuk membuat/update warna grid
function updateGrid(isLightMode) {
    // Hapus grid lama kalau ada
    if(gridHelper) scene.remove(gridHelper);

    // Tentukan warna: (Warna Garis Utama, Warna Garis Kotak)
    const color1 = isLightMode ? 0x888888 : 0x444444; // Garis tengah
    const color2 = isLightMode ? 0xcccccc : 0x222222; // Garis kotak kecil

    gridHelper = new THREE.GridHelper(20, 20, color1, color2);
    gridHelper.position.y = -1.2;
    scene.add(gridHelper);
}

// Panggil pertama kali (Mode Gelap)
updateGrid(false);

const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: 0.2 })
);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -1.2;
plane.receiveShadow = true;
scene.add(plane);

// --- CLAY MESH ---
let clayMesh;
const historyStack = [];
const redoStack = [];

function createClay() {
    if(clayMesh) { scene.remove(clayMesh); clayMesh.geometry.dispose(); }
    historyStack.length = 0; redoStack.length = 0;

    const geometry = new THREE.IcosahedronGeometry(1, 40); 
    const material = new THREE.MeshStandardMaterial({ 
        color: document.getElementById('color-picker').value, 
        flatShading: false, roughness: 0.5, metalness: 0.1,
        wireframe: document.getElementById('wireframe-toggle').checked 
    });
    clayMesh = new THREE.Mesh(geometry, material);
    clayMesh.castShadow = true; clayMesh.receiveShadow = true;
    scene.add(clayMesh);
}
createClay();

// --- CURSOR ---
const cursorMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.5, transparent: true })
);
scene.add(cursorMesh);

// --- CONTROLS ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.mouseButtons = {
    LEFT: null,               
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE  
};

let pullMode = false;

// --- EVENT LISTENERS UI ---

// TOGGLE BACKGROUND (UPDATE: GANTI WARNA GRID JUGA)
const bgToggle = document.getElementById('bg-toggle');
const appBody = document.getElementById('app-body');

bgToggle.addEventListener('change', (e) => {
    const isLight = e.target.checked;
    
    if(isLight) {
        // Mode Terang
        scene.background.setHex(LIGHT_BG);
        scene.fog.color.setHex(LIGHT_BG);
        appBody.classList.add('light-mode');
    } else {
        // Mode Gelap
        scene.background.setHex(DARK_BG);
        scene.fog.color.setHex(DARK_BG);
        appBody.classList.remove('light-mode');
    }
    
    // Update warna grid sesuai mode
    updateGrid(isLight);
});


document.getElementById('btn-push').addEventListener('click', (e) => setPullMode(false, e.target));
document.getElementById('btn-pull').addEventListener('click', (e) => setPullMode(true, e.target));

function setPullMode(isPull, btn) {
    pullMode = isPull;
    document.querySelectorAll('.toggle-row button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    cursorMesh.material.color.set(isPull ? 0xff4444 : 0xffff00);
}

document.getElementById('wireframe-toggle').addEventListener('change', (e) => {
    if(clayMesh) clayMesh.material.wireframe = e.target.checked;
});

// --- SCULPTING LOGIC ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let isSculpting = false;

function saveState() {
    historyStack.push(new Float32Array(clayMesh.geometry.attributes.position.array));
    if(historyStack.length > 15) historyStack.shift();
    redoStack.length = 0;
}

function pahat() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(clayMesh);

    if (hits.length > 0) {
        cursorMesh.position.copy(hits[0].point);
        cursorMesh.visible = true;
        
        if (isSculpting) {
            const pos = clayMesh.geometry.attributes.position;
            const v = new THREE.Vector3();
            const size = parseFloat(document.getElementById('brush-size').value);
            const str = parseFloat(document.getElementById('brush-strength').value);

            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i);
                const d = v.distanceTo(hits[0].point);
                if (d < size) {
                    const force = (1 - d / size) * str;
                    v.multiplyScalar(pullMode ? (1 + force) : (1 - force));
                    pos.setXYZ(i, v.x, v.y, v.z);
                }
            }
            pos.needsUpdate = true;
            clayMesh.geometry.computeVertexNormals();
        }
    } else cursorMesh.visible = false;
}

const updatePointer = (x, y) => {
    pointer.x = (x / window.innerWidth) * 2 - 1;
    pointer.y = - (y / window.innerHeight) * 2 + 1;
};

window.addEventListener('pointermove', (e) => {
    updatePointer(e.clientX, e.clientY);
    if(isSculpting) pahat();
    else {
        raycaster.setFromCamera(pointer, camera);
        if(raycaster.intersectObject(clayMesh).length > 0) cursorMesh.visible = true;
        else cursorMesh.visible = false;
    }
});

// MOUSE CLICK
window.addEventListener('mousedown', (e) => {
    if(e.target.tagName !== 'CANVAS') return;
    if(e.button === 0) { // KLIK KIRI = PAHAT
        saveState(); 
        isSculpting = true; 
        pahat();
    }
});
window.addEventListener('mouseup', () => isSculpting = false);

// BUTTONS
const applyState = (stackFrom, stackTo) => {
    if(stackFrom.length === 0) return;
    stackTo.push(new Float32Array(clayMesh.geometry.attributes.position.array));
    clayMesh.geometry.attributes.position.array.set(stackFrom.pop());
    clayMesh.geometry.attributes.position.needsUpdate = true;
    clayMesh.geometry.computeVertexNormals();
};
document.getElementById('btn-undo').addEventListener('click', () => applyState(historyStack, redoStack));
document.getElementById('btn-redo').addEventListener('click', () => applyState(redoStack, historyStack));
document.getElementById('btn-reset').addEventListener('click', createClay);
document.getElementById('color-picker').addEventListener('input', (e) => clayMesh.material.color.set(e.target.value));
document.getElementById('btn-save').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([new OBJExporter().parse(clayMesh)], {type:'text/plain'}));
    link.download = 'karya.obj'; link.click();
});

// RENDER
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate();