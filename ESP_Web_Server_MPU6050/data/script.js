let scene, camera, renderer, satellite;
let rotX = 0, rotY = 0, rotZ = 0;
let lastTime = performance.now();

/****************** AXIS CALIBRATION ******************
 * The MPU6050's X/Y/Z axes depend on how the sensor is physically
 * mounted inside the satellite, so there's no universal "correct"
 * mapping to the 3D model's axes. Use this block to calibrate it:
 *
 * 1. Flash the firmware, open the dashboard, and slowly rotate the
 *    satellite around ONE axis at a time (e.g. spin it flat, like a yaw).
 * 2. Watch which axis the 3D model rotates around.
 *    - If it rotates around the wrong axis, change which key
 *      (x/y/z) that gyro axis maps to below.
 *    - If it rotates the right way but backwards, flip the matching
 *      invert flag to true.
 * 3. Repeat for the other two axes.
 *
 * Defaults below match the model's previous behavior (gyroX -> model Z,
 * gyroY -> model X, gyroZ -> model Y).
 */
const AXIS_MAP = {
  gyroX: 'z',
  gyroY: 'x',
  gyroZ: 'y',
  invert: { gyroX: false, gyroY: false, gyroZ: false }
};

let luminosity = 50000;

/****************** METALLIC SOLAR PANEL TEXTURE ******************/
function createMetalSolarTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0,0,size,size);
  gradient.addColorStop(0,"#0e2354");
  gradient.addColorStop(1,"#0a1b47");
  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,size,size);

  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2;
  const spacing = 22;
  for (let i=0;i<=size;i+=spacing){
    ctx.beginPath();
    ctx.moveTo(i,0); ctx.lineTo(i,size); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0,i); ctx.lineTo(size,i); ctx.stroke();
  }

  return new THREE.CanvasTexture(canvas);
}

/****************** INIT THREE.JS ******************/
function init() {
  const container = document.getElementById("satellite3D");
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    500
  );
  camera.position.set(0, 8, 20);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff,1.2));
  const sun = new THREE.DirectionalLight(0xffffff,2.5);
  sun.position.set(50,80,60);
  scene.add(sun);

  satellite = new THREE.Group();
  satellite.scale.set(0.6, 0.6, 0.6);
  scene.add(satellite);

  const GOLD = 0xffdf63;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3,3,3),
    new THREE.MeshStandardMaterial({
      color: GOLD,
      metalness: 1,
      roughness: 0.25,
      emissive: 0x8a6e00,
      emissiveIntensity: 0.4
    })
  );
  satellite.add(body);

  const sensor = new THREE.Mesh(
    new THREE.BoxGeometry(1.2,1.2,1.2),
    new THREE.MeshStandardMaterial({
      color:GOLD,
      metalness:1,
      emissive:0x7a5a00,
      emissiveIntensity:0.45
    })
  );
  sensor.position.set(0,0,2.3);
  satellite.add(sensor);

  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15,0.15,7,16),
    new THREE.MeshStandardMaterial({
      color:GOLD,
      metalness:1,
      emissive:0x725000,
      emissiveIntensity:0.3
    })
  );
  rod.rotation.x = Math.PI/2;
  satellite.add(rod);

  const solarTex = createMetalSolarTexture();
  function createPanel(dir){
    const group = new THREE.Group();
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(7,0.3,4),
      new THREE.MeshStandardMaterial({
        map: solarTex,
        metalness:0.8,
        roughness:0.35
      })
    );
    panel.rotation.y = Math.PI/2;
    panel.position.x = dir*6.5;

    const linkRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12,0.12,4,16),
      new THREE.MeshStandardMaterial({
        color:GOLD,
        metalness:1,
        emissive:0x6a5200,
        emissiveIntensity:0.3
      })
    );
    linkRod.rotation.z = Math.PI/2;
    linkRod.position.x = dir*4.5;

    group.add(panel);
    group.add(linkRod);
    return group;
  }
  satellite.add(createPanel(1));
  satellite.add(createPanel(-1));

  animate();
}

/****************** ANIMATION ******************/
function animate(){
  requestAnimationFrame(animate);
  if(satellite){
    const gx = AXIS_MAP.invert.gyroX ? -rotX : rotX;
    const gy = AXIS_MAP.invert.gyroY ? -rotY : rotY;
    const gz = AXIS_MAP.invert.gyroZ ? -rotZ : rotZ;

    satellite.rotation[AXIS_MAP.gyroX] = gx;
    satellite.rotation[AXIS_MAP.gyroY] = gy;
    satellite.rotation[AXIS_MAP.gyroZ] = gz;
  }
  renderer.render(scene,camera);
}

/****************** WINDOW RESIZE ******************/
window.addEventListener("resize",()=>{
  const container = document.getElementById("satellite3D");
  if(container && camera && renderer){
    camera.aspect = container.clientWidth/container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth,container.clientHeight);
  }
});

/****************** SSE SENSOR EVENTS ******************/
function setupSensorEventListener(){
  if(!window.EventSource) {
    console.error("EventSource not supported");
    return;
  }
  
  const source = new EventSource("/events");

  source.addEventListener("open",()=>{
    const dot = document.querySelector(".dot");
    const statusText = document.getElementById("statusText");
    if(dot){ 
      dot.style.background="#22c55e"; 
      dot.style.boxShadow="0 0 10px #22c55e"; 
    }
    if(statusText) statusText.textContent = "Connected";
  });

  source.addEventListener("error",(e)=>{
    const dot = document.querySelector(".dot");
    const statusText = document.getElementById("statusText");
    if(dot){ 
      dot.style.background="#ef4444"; 
      dot.style.boxShadow="0 0 10px #ef4444"; 
    }
    if(statusText) statusText.textContent = "Disconnected";
    if(e.target.readyState===EventSource.CLOSED) console.log("Connection closed");
  });

  // Gyroscope readings
  source.addEventListener("gyro_readings",(e)=>{
    const obj = JSON.parse(e.data);
    const gx = parseFloat(obj.gyroX) || 0;
    const gy = parseFloat(obj.gyroY) || 0;
    const gz = parseFloat(obj.gyroZ) || 0;
    
    document.getElementById("gyroX").textContent = gx.toFixed(2);
    document.getElementById("gyroY").textContent = gy.toFixed(2);
    document.getElementById("gyroZ").textContent = gz.toFixed(2);

    const now = performance.now();
    const dt = (now - lastTime)/1000;
    lastTime = now;
    rotX += gx*(Math.PI/180)*dt;
    rotY += gy*(Math.PI/180)*dt;
    rotZ += gz*(Math.PI/180)*dt;
  });

  // Magnetometer readings (real sensor data - HMC5883L or QMC5883L, auto-detected on the ESP32)
  source.addEventListener("magnetometer_readings",(e)=>{
    const obj = JSON.parse(e.data);
    document.getElementById("magX").textContent = (parseFloat(obj.magX) || 0).toFixed(2);
    document.getElementById("magY").textContent = (parseFloat(obj.magY) || 0).toFixed(2);
    document.getElementById("magZ").textContent = (parseFloat(obj.magZ) || 0).toFixed(2);
  });

  // Accelerometer readings
  source.addEventListener("accelerometer_readings",(e)=>{
    const obj = JSON.parse(e.data);
    document.getElementById("accX").textContent = (parseFloat(obj.accX) || 0).toFixed(2);
    document.getElementById("accY").textContent = (parseFloat(obj.accY) || 0).toFixed(2);
    document.getElementById("accZ").textContent = (parseFloat(obj.accZ) || 0).toFixed(2);
  });

  // Temperature reading
  source.addEventListener("temperature_reading",(e)=>{
    const val = parseFloat(e.data);
    document.getElementById("temp").textContent = isNaN(val) ? "0.0°C" : val.toFixed(1)+"°C";
  });

  // Pressure reading
  source.addEventListener("pressure_reading",(e)=>{
    const val = parseFloat(e.data);
    document.getElementById("pressure").textContent = isNaN(val) ? "0.0 hPa" : val.toFixed(1)+" hPa";
  });

  // Luminosity reading (real sensor data from ESP32, e.g. BH1750/LDR)
  source.addEventListener("luminosity_reading",(e)=>{
    const val = parseFloat(e.data);
    luminosity = isNaN(val) ? 0 : val;
    document.getElementById("luminosity").textContent = (isNaN(val) ? 0 : Math.round(val)) + " lux";
  });
}

/****************** START ******************/
document.addEventListener("DOMContentLoaded",()=>{
  init();
  setupSensorEventListener();
});
