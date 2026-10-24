import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const $ = (id) => document.getElementById(id);
const viewport = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080d10);
scene.fog = new THREE.FogExp2(0x080d10, 0.027);

const camera = new THREE.PerspectiveCamera(73, innerWidth / innerHeight, 0.08, 90);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
viewport.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x9ba8a3, 0x171a17, 0.62));
const ambient = new THREE.AmbientLight(0x84909a, 0.3); scene.add(ambient);

const mats = {
  wall: new THREE.MeshStandardMaterial({ color: 0x353a36, roughness: .96 }),
  wallDark: new THREE.MeshStandardMaterial({ color: 0x222724, roughness: 1 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x30312a, roughness: .94 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x53564c, roughness: .9 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x333b3b, metalness: .62, roughness: .58 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x6c4330, metalness: .34, roughness: .78 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x171d1d, metalness: .52, roughness: .72 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x4d4030, roughness: .9 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xbdb69d, roughness: 1 }),
  black: new THREE.MeshStandardMaterial({ color: 0x080a09, roughness: .9 }),
};
const colliders = [];
const interactables = [];
const clock = new THREE.Clock();
const tweens=[];
const world = {
  active: false, paused: false, ended: false, episode: 1, fuses: 0, generator: false,
  monsterAwake: false, monsterCaught: false, monsterState: 'dormant',
  flashlight: true, battery: 1, yaw: 0, pitch: 0, moving: false, stamina: 1, walked: 0,
  crouched: false, hidden: false, phase: 'fuses', evidence: new Set(), fuseIds: new Set(), batteries: new Set(), tape: false,
  ep2Evidence: new Set(), ep2Dials: [0,0,0], ep2Power: false, ep2Ending: null, previousEnding: null,
  dials: [0, 0, 0], signalTuned: false, ending: null, lastNoise: 0, noiseAt: { x: 0, z: 0 }, footstepTimer: 0,
  saveTimer: 0, elapsedSeconds: 0, clockTimer: 0,
};
const player = { x: 0, z: 15.6, y: 1.64, radius: .34 };
function stationTime(){
  const start=3*60+17,multiplier=world.episode===2?3.5:3,total=start+Math.floor((world.elapsedSeconds||0)*multiplier/60),hours=Math.floor(total/60)%24,minutes=total%60;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
}
function updateStationClock(){const clockElement=$('clock-display');if(clockElement)clockElement.textContent=stationTime();}

function box(name, x, y, z, sx, sy, sz, material, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
  mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = false; mesh.receiveShadow = true;
  scene.add(mesh);
  if (options.collider) colliders.push({ x, z, hx: sx / 2, hz: sz / 2 });
  return mesh;
}
function floor(x, z, sx, sz, material = mats.floor) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), material);
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, -.08, z); scene.add(mesh); return mesh;
}
function wallX(x, z1, z2, material = mats.wall) { box('wall', x, 1.65, (z1 + z2) / 2, .42, 3.3, z2 - z1, material, { collider: true }); }
function wallZ(z, x1, x2, material = mats.wall) { box('wall', (x1 + x2) / 2, 1.65, z, x2 - x1, 3.3, .42, material, { collider: true }); }
function pointLight(x, y, z, color, intensity, distance, decay = 2) {
  const light = new THREE.PointLight(color, intensity, distance, decay); light.position.set(x,y,z); scene.add(light); return light;
}
function tweenProperty(target,property,to,duration=1,ease='smooth',complete){
  tweens.push({target,property,from:target[property],to,duration,start:clock.elapsedTime,ease,complete});
}
function updateTweens(){
  for(let i=tweens.length-1;i>=0;i--){
    const item=tweens[i],raw=THREE.MathUtils.clamp((clock.elapsedTime-item.start)/item.duration,0,1);
    const t=item.ease==='out'?1-(1-raw)**3:item.ease==='in'?raw**3:raw*raw*(3-2*raw);
    item.target[item.property]=THREE.MathUtils.lerp(item.from,item.to,t);
    if(raw>=1){tweens.splice(i,1);item.complete?.();}
  }
}
function stinger(color='#c88763',strength=.72){
  const layer=$('screen-flash');layer.style.backgroundColor=color;layer.style.opacity=String(strength);world.cameraShake=Math.max(world.cameraShake||0,.34);
  requestAnimationFrame(()=>{layer.style.opacity='0';});
}
function fixture(x, z, color = 0xc3b995, strength = .85) {
  box('lamp housing', x, 3.1, z, .85, .12, .32, mats.darkMetal);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(.49,.035,.16), new THREE.MeshBasicMaterial({ color }));
  bulb.position.set(x,3.02,z);scene.add(bulb);pointLight(x,2.95,z,color,strength*15,9.5,1.8);
}
function sign(text, x, y, z, width = 2.1) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const c = canvas.getContext('2d'); c.fillStyle = '#26302e';c.fillRect(0,0,512,128);c.strokeStyle='#93644a';c.lineWidth=5;c.strokeRect(5,5,502,118);
  c.fillStyle='#c7b99a';c.font='bold 35px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,65);
  const tex = new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width,.58),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));mesh.position.set(x,y,z);scene.add(mesh);return mesh;
}
function canister(x,z,scale=1) {
  const obj = new THREE.Group(); obj.position.set(x,0,z);scene.add(obj);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.28*scale,.3*scale,.9*scale,8),mats.rust);body.position.y=.48*scale;obj.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.12*scale,.12*scale,.13*scale,8),mats.darkMetal);cap.position.y=.98*scale;obj.add(cap);
  box('canister band',x,.55*scale,z,.57*scale,.1*scale,.57*scale,mats.concrete);
  return obj;
}
function table(x,z,w=1.6,d=.9,y=.8) {
  box('table top',x,y,z,w,.12,d,mats.wood);
  for(const dx of [-w*.42,w*.42])for(const dz of [-d*.38,d*.38])box('table leg',x+dx,y/2,z+dz,.09,y,.09,mats.darkMetal);
}
function shelf(x,z,rotation=0) {
  const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=rotation;scene.add(group);
  for(const dx of [-.83,.83]){const post=new THREE.Mesh(new THREE.BoxGeometry(.1,2.2,.1),mats.rust);post.position.set(dx,1.1,0);group.add(post);}
  for(const y of [.25,.95,1.65,2.15]){const plank=new THREE.Mesh(new THREE.BoxGeometry(1.8,.1,.58),mats.darkMetal);plank.position.set(0,y,0);group.add(plank);}
  for(let i=0;i<5;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(.19,.48,.34),i%2?mats.wood:mats.concrete);b.position.set(-.65+i*.3,.57,(i%2)*.03);group.add(b);}
}
function paper(x,z,rotation=0){
  const note=box('paper',x,.89,z,.52,.025,.34,mats.paper);note.rotation.y=rotation;
}

// The station is laid out as a long, readable corridor with four little side rooms.
floor(0,0,8,40);floor(-10,0,12,40);floor(10,0,12,40);floor(0,-24,8,8);
// Floor panels and ceiling beams give the corridor its repeating industrial rhythm.
for(let z=-18;z<=18;z+=4){
  box('ceiling beam',0,3.25,z,8.8,.18,.22,mats.darkMetal);
  box('floor seam',0,-.06,z,7.7,.018,.035,mats.concrete);
}
// Corridor-to-room walls, with deliberate openings at each doorway.
for(const x of [-4,4]){
  wallX(x,-20,-10.1);wallX(x,-5.9,5.9);wallX(x,10.1,20);
}
for(const x of [-16,16])wallX(x,-20,20,mats.wallDark);
// Room partitions: each side of the central passage has two enclosed rooms.
for(const z of [-13,-3,3,13]){wallZ(z,-16,-4,mats.wallDark);wallZ(z,4,16,mats.wallDark);}
// North generator chamber and south exit.
wallZ(-20,-16,-4,mats.wallDark);wallZ(-20,4,16,mats.wallDark);
// A locked maintenance gate connects the generator room to the buried relay wing.
wallZ(-28,-4,-1.28,mats.wallDark);wallZ(-28,1.28,4,mats.wallDark);wallX(-4,-28,-20,mats.wallDark);wallX(4,-28,-20,mats.wallDark);
const serviceGate=box('service gate',0,1.58,-28,2.45,3.05,.28,mats.darkMetal,{collider:true});
// The second half of the station: cable tunnel, signal chamber, and two archive annexes.
floor(0,-35.5,8,15);floor(0,-50,16,14);floor(-13,-50,10,14);floor(12,-50,8,14);
for(const x of [-4,4]){wallX(x,-43,-28,mats.wallDark);}
wallZ(-43,-16,-4,mats.wallDark);wallZ(-43,4,16,mats.wallDark);
wallX(-8,-57,-52.2,mats.wallDark);wallX(-8,-47.8,-43,mats.wallDark);
wallX(-18,-57,-43,mats.wallDark);wallZ(-57,-18,-8,mats.wallDark);wallZ(-43,-18,-8,mats.wallDark);
wallX(8,-57,-52.2,mats.wallDark);wallX(8,-47.8,-43,mats.wallDark);
wallX(16,-57,-43,mats.wallDark);wallZ(-57,8,16,mats.wallDark);wallZ(-43,8,16,mats.wallDark);
wallZ(-57,-8,8,mats.wallDark);
for(const z of [-31,-37,-42]){box('tunnel crossbeam',0,3.18,z,8.6,.16,.22,mats.rust);fixture(0,z,0xc1ae87,.47);}
fixture(-13,-50,0x9a4937,.55);fixture(12,-50,0x9babb0,.52);
wallZ(20,-16,-1.5,mats.wallDark);wallZ(20,1.5,16,mats.wallDark);
// Red emergency exit frame.
box('exit frame',-1.45,1.65,20, .22,3.3,.34,mats.rust);box('exit frame',1.45,1.65,20,.22,3.3,.34,mats.rust);box('exit lintel',0,3.15,20,3.1,.3,.34,mats.rust);
const exitDoor=box('exit door',0,1.55,20,2.75,3,.28,mats.darkMetal,{collider:true});
sign('ВЫХОД  /  EXIT',0,2.37,19.77,2.25);

// Details: flickering lights, wiring, stained paint, lockers, desk clutter.
fixture(0,-17,0xc7b78e,.55);fixture(0,-8,0x9aafad,.72);fixture(0,0,0xc8b991,.58);fixture(0,8,0x9b4030,.4);fixture(0,16,0xc3b995,.62);
fixture(-10,-8,0xc6b58c,.43);fixture(10,-8,0x9eafb0,.48);fixture(-10,8,0x9c4935,.38);fixture(10,8,0xc7b68c,.42);
const alarmGlow=pointLight(0,2.35,8,0xad3527,0,12,2.2);
sign('РЕЛЕЙНЫЙ ЗАЛ',0,2.66,-6.2,2.8);sign('АРХИВ',10,2.55,-12.76,1.45);sign('МАСТЕРСКАЯ',-10,2.55,12.76,2.1);sign('ЩИТОВАЯ',0,2.65,-25.78,1.7);
sign('КАБЕЛЬНЫЙ ТОННЕЛЬ',0,2.55,-34.5,3.1);sign('ЛИНИЯ 4',0,2.48,-44,1.7);sign('АРХИВ ЛЕНТ',-13,2.55,-43.76,2.15);sign('КОММУТАТОР',12,2.55,-43.76,2.1);
// Pipe runs.
for(const x of [-3.45,3.45]){
  const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,38,8),mats.rust);pipe.rotation.x=Math.PI/2;pipe.position.set(x,2.91,0);scene.add(pipe);
}
// Side room furniture.
table(-10,-8,2.3,1.15);box('relay console',-10,.98,-8,1.8,.35,.56,mats.darkMetal);box('relay screen',-10,1.48,-8.18,.72,.48,.08,new THREE.MeshBasicMaterial({color:0x8b3527}));pointLight(-10,1.5,-8.7,0xb33625,.35,2);
for(let i=0;i<3;i++)box('relay switch',-10.58+i*.29,1.21,-7.68,.12,.1,.12,mats.rust);
shelf(13,-8);shelf(7,-8,Math.PI);
table(-10,8,2.0,1.0);box('radio',-10,.98,8,1.05,.35,.47,mats.darkMetal);box('radio dial',-10,1.2,7.73,.45,.17,.04,new THREE.MeshBasicMaterial({color:0x9c4830}));
for(let i=0;i<4;i++){box('locker',13+i*.72,1.3,8,.65,2.6,.6,mats.metal,{collider:true});box('locker handle',13.21+i*.72,1.3,7.67,.05,.32,.04,mats.rust);}
table(10,-8,1.8,1.0);box('reel recorder',10,.99,-8,1.05,.32,.54,mats.darkMetal);
for(const x of [-.72,.72]){const reel=new THREE.Mesh(new THREE.TorusGeometry(.17,.035,6,12),mats.rust);reel.position.set(10+x,1.14,-8.28);scene.add(reel);}
// Random floor stains and loose cable lengths.
for(let i=0;i<18;i++){
  const x=(Math.random()-.5)*6.8,z=-17+Math.random()*34;
  const stain=new THREE.Mesh(new THREE.CircleGeometry(.25+Math.random()*.5,7),new THREE.MeshBasicMaterial({color:0x111614,transparent:true,opacity:.26,depthWrite:false}));
  stain.rotation.x=-Math.PI/2;stain.position.set(x,-.052,z);stain.scale.set(1+Math.random(),.45+Math.random()*.7,1);scene.add(stain);
}
for(let i=0;i<7;i++){
  const cable=new THREE.Mesh(new THREE.TorusGeometry(.32+Math.random()*.28,.025,5,18,Math.PI*1.6),mats.black);cable.rotation.x=Math.PI/2;cable.position.set(-2.8+Math.random()*5.6,-.025,-14+i*4.4);scene.add(cable);
}
// Generator and its panel.
box('generator base',0,.28,-25,3.5,.55,2.4,mats.darkMetal,{collider:true});
const generatorBody=box('generator body',0,1.35,-25,3.1,1.65,2,mats.metal,{collider:true});
for(const x of [-1,0,1]){const vent=box('generator vent',x,1.42,-23.97,.09,.82,.035,mats.black);vent.rotation.z=.12;}
box('generator cap',0,2.24,-25,3.3,.16,2.15,mats.rust);
const generatorRotor=new THREE.Group();generatorRotor.position.set(1.03,1.38,-23.91);scene.add(generatorRotor);
const rotorHub=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.12,10),mats.rust);rotorHub.rotation.x=Math.PI/2;generatorRotor.add(rotorHub);
for(let i=0;i<4;i++){const blade=new THREE.Mesh(new THREE.BoxGeometry(.1,.46,.055),mats.metal);blade.position.y=.25;blade.rotation.z=i*Math.PI/2;generatorRotor.add(blade);}
for(const x of [-1.25,1.25]){const gauge=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.09,16),new THREE.MeshBasicMaterial({color:0xa03f2b}));gauge.rotation.x=Math.PI/2;gauge.position.set(x,1.8,-23.93);scene.add(gauge);}
const generatorPrompt=box('generator panel',0,1.28,-23.88,.75,.62,.12,mats.darkMetal);
const generatorLamp=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshStandardMaterial({color:0x872f22,emissive:0x30100a,roughness:.4}));generatorLamp.position.set(0,1.35,-23.78);scene.add(generatorLamp);
box('exhaust pipe',1.32,2.6,-25,.22,.85,.22,mats.rust);
// Tape archive and a dead commutator: the central mystery and the episode's puzzle.
table(-13,-50,2.4,1.25);shelf(-16,-50,Math.PI/2);shelf(-10,-50,Math.PI/2);
table(12,-50,2.3,1.1);box('commutator rack',12,1.55,-53.35,3.2,2.7,.5,mats.darkMetal,{collider:true});
for(let row=0;row<3;row++)for(let col=0;col<7;col++){
  const lamp=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.035),new THREE.MeshBasicMaterial({color:(row+col)%4===0?0x9e4932:0x586c62}));lamp.position.set(10.85+col*.38,2.35-row*.48,-53.06);scene.add(lamp);
}
box('signal console',0,1.12,-53.05,3.5,.42,.8,mats.metal,{collider:true});
box('signal screen',0,1.75,-53.15,2.3,.78,.08,new THREE.MeshBasicMaterial({color:0x253d39}));
const dialMeshes=[];
for(let i=0;i<3;i++){
  const dial=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.12,12),new THREE.MeshStandardMaterial({color:0x9a6245,metalness:.7,roughness:.4}));dial.rotation.x=Math.PI/2;dial.position.set(-.85+i*.85,1.15,-52.56);scene.add(dial);dialMeshes.push(dial);
  const dialLabel=sign(`КАНАЛ ${i+1}`, -.85+i*.85,2.17,-52.58,.8);
}
const signalLight=new THREE.Mesh(new THREE.SphereGeometry(.12,10,8),new THREE.MeshStandardMaterial({color:0x903b2a,emissive:0x250b07,roughness:.35}));signalLight.position.set(1.35,1.78,-53.05);scene.add(signalLight);
// Exit interaction is just outside the station, beyond its heavy door.

function makeFuse(x,z,index){
  const group=new THREE.Group();group.position.set(x,.7,z);scene.add(group);
  const glass=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.62,10),new THREE.MeshStandardMaterial({color:0x8c7351,emissive:0x25170d,roughness:.2,metalness:.3}));glass.rotation.z=Math.PI/2;group.add(glass);
  const capMat=new THREE.MeshStandardMaterial({color:0xb5a47e,metalness:.7,roughness:.28});
  for(const dx of [-.36,.36]){const cap=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.12,10),capMat);cap.rotation.z=Math.PI/2;cap.position.x=dx;group.add(cap);}
  const glow=new THREE.PointLight(0xd89d5d,.8,3,2);glow.position.set(0,.1,0);group.add(glow);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.23,.022,5,18),new THREE.MeshBasicMaterial({color:0xd18a54}));halo.position.y=-.22;halo.rotation.x=Math.PI/2;group.add(halo);
  interactables.push({type:'fuse',object:group,x,z,index,active:true,label:'Поднять предохранитель'});
  return group;
}
const fuses=[makeFuse(-10,-8,1),makeFuse(10,-8,2),makeFuse(-10,8,3)];

interactables.push({type:'generator',object:generatorPrompt,x:0,z:-23.1,active:true,label:'Запустить генератор'});
interactables.push({type:'gate',object:serviceGate,x:0,z:-27.15,active:true,label:'Открыть сервисный шлюз'});
interactables.push({type:'exit',object:exitDoor,x:0,z:19.3,active:true,label:'Открыть дверь'});
const masterTape=new THREE.Group();masterTape.position.set(-13,1.04,-50);scene.add(masterTape);
const tapeDisc=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.08,18),mats.darkMetal);tapeDisc.rotation.x=Math.PI/2;masterTape.add(tapeDisc);
const tapeHub=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.1,10),mats.rust);tapeHub.rotation.x=Math.PI/2;tapeHub.position.z=-.055;masterTape.add(tapeHub);
interactables.push({type:'tape',object:masterTape,x:-13,z:-50,active:true,label:'Забрать мастер-ленту'});
for(let i=0;i<3;i++)interactables.push({type:'dial',object:dialMeshes[i],x:-.85+i*.85,z:-52.56,index:i,active:true,label:`Настроить канал ${i+1}`});
const records=[
  {id:'shift-log',x:-9.2,z:8.25,title:'Журнал смены',text:'17 октября, 02:40. Линия четыре снова ожила после отключения. Из трубки говорит Лена Волкова. Она просит не запускать генератор. Лены нет в живых с 1991 года. Я снял трубку, но голос продолжал идти из динамика.'},
  {id:'relay-report',x:10,z:-8,title:'Акт релейной бригады',text:'Акт №104. Кабельный тоннель затоплен по колено. На двери архива обнаружены свежие царапины изнутри. Инженер Соколов отказался подписывать акт и ушёл в нижний коммутатор. Время ухода в журнале: 03:24. Часы в зале показывают 03:17.'},
  {id:'workshop-note',x:-10,z:-8,title:'Записка на схеме',text:'Порядок для ручного коммутатора: сначала вызвать линию 3, потом 7, потом 2. Не отвечать на линию 4. Если голос назовёт твоё имя — не называй своё.'},
  {id:'tunnel-tag',x:2.8,z:-38,title:'Бирка кабеля',text:'Линия 4 / резерв. Кабель заменён 18.10.98. На обороте карандашом: «Она говорит из комнаты, которой здесь нет».'},
];
for(const entry of records){
  const note=box('record',entry.x,.93,entry.z,.45,.035,.3,mats.paper);note.rotation.y=entry.x>0?-.25:.2;
  interactables.push({type:'record',object:note,x:entry.x,z:entry.z,record:entry,active:true,label:`Прочитать: ${entry.title}`});
}
const evidenceReels=[];
for(const [i,loc] of [[0,[-12.2,-50.3]],[1,[13,-50]]]){
  const reelGroup=new THREE.Group();reelGroup.position.set(loc[0],1.04,loc[1]);scene.add(reelGroup);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.1,10),mats.rust);hub.rotation.x=Math.PI/2;hub.position.set(0,0,-.06);reelGroup.add(hub);
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.09,16),mats.darkMetal);disc.rotation.x=Math.PI/2;reelGroup.add(disc);evidenceReels.push(reelGroup);
}
interactables.push({type:'evidence',object:evidenceReels[0],x:-12.2,z:-50.3,id:'backup-reel',active:true,label:'Забрать резервную ленту'});
interactables.push({type:'evidence',object:evidenceReels[1],x:13,z:-50,id:'transmitter-log',active:true,label:'Забрать лист настройки'});
function makeBattery(x,z,id){
  const group=new THREE.Group();group.position.set(x,.32,z);scene.add(group);
  const cell=new THREE.Mesh(new THREE.BoxGeometry(.34,.5,.22),new THREE.MeshStandardMaterial({color:0x68725a,metalness:.35,roughness:.52,emissive:0x171d13}));group.add(cell);
  const cap=new THREE.Mesh(new THREE.BoxGeometry(.16,.08,.13),mats.rust);cap.position.y=.29;group.add(cap);
  const glow=new THREE.PointLight(0xb7a86c,.8,2.5,2);glow.position.y=.4;group.add(glow);
  interactables.push({type:'battery',object:group,x,z,id,active:true,label:'Забрать элемент питания'});
}
makeBattery(11.5,7.3,'locker-cell');makeBattery(2.5,-32.2,'tunnel-cell');
interactables.push({type:'hide',object:new THREE.Object3D(),x:12.25,z:8,active:true,label:'Спрятаться в шкафу'});
box('archive hide cabinet',-16.7,1.3,-50,.72,2.6,.7,mats.rust,{collider:true});
interactables.push({type:'hide',object:new THREE.Object3D(),x:-15.95,z:-50,active:true,label:'Спрятаться за шкафом'});
box('tunnel service locker',3.2,1.12,-40.15,.72,2.2,.72,mats.darkMetal,{collider:true});
interactables.push({type:'hide',object:new THREE.Object3D(),x:2.4,z:-40.15,active:true,label:'Спрятаться в нише'});

// Episode II: District Radio Center, hidden far beyond the fog from Station 13.
floor(100,0,8,40);floor(90,0,12,40);floor(110,0,12,40);
floor(100,26,40,12);floor(100,-26,16,12);floor(100,-40,16,16);
for(const x of [96,104])wallX(x,-20,-10.1),wallX(x,-5.9,5.9),wallX(x,10.1,20);
for(const x of [84,116])wallX(x,-20,20,mats.wallDark);
for(const z of [-13,-3,3,13]){wallZ(z,84,96,mats.wallDark);wallZ(z,104,116,mats.wallDark);}
wallZ(-20,84,96,mats.wallDark);wallZ(-20,104,116,mats.wallDark);
wallZ(20,84,98.5,mats.wallDark);wallZ(20,101.5,116,mats.wallDark);
wallX(92,-32,-20,mats.wallDark);wallX(108,-32,-20,mats.wallDark);wallZ(-32,92,98.7,mats.wallDark);wallZ(-32,101.3,108,mats.wallDark);
const e2ServiceGate=box('radio center gate',100,1.58,-32,2.45,3.05,.28,mats.darkMetal,{collider:true});
wallX(92,-48,-32,mats.wallDark);wallX(108,-48,-32,mats.wallDark);wallZ(-48,92,108,mats.wallDark);
const e2ExitDoor=box('radio center exit',100,1.55,20,2.75,3,.28,mats.darkMetal,{collider:true});
box('e2 exit jamb',98.55,1.65,20,.22,3.3,.34,mats.rust);box('e2 exit jamb',101.45,1.65,20,.22,3.3,.34,mats.rust);box('e2 exit lintel',100,3.15,20,3.1,.3,.34,mats.rust);
sign('РАЙОННЫЙ РАДИОЦЕНТР',100,2.55,17.7,3.6);sign('МОНТАЖНАЯ',90,2.5,-12.76,2.1);sign('АРХИВ ЭФИРА',110,2.5,-12.76,2.15);sign('ЭФИРНАЯ',90,2.5,12.76,1.7);sign('ЩИТОВАЯ',100,2.55,-29.5,1.7);sign('ПЕРЕДАТЧИК',100,2.55,-44,2.1);
for(const z of [-16,-8,0,8,16]){box('radio center ceiling beam',100,3.22,z,8.8,.17,.22,mats.rust);fixture(100,z,z===0?0xa83e31:0xb5ad91,z===0?.28:.48);}
fixture(90,-8,0xc1b18b,.43);fixture(110,-8,0x9eafb0,.43);fixture(90,8,0x9c4935,.34);fixture(110,8,0xc1b18b,.4);fixture(100,-25,0x9eafb0,.45);fixture(100,-39,0x9eafb0,.48);
const e2AlarmGlow=pointLight(100,2.35,0,0xad3527,0,12,2.2);
table(90,-8,2.2,1.15);box('e2 reel deck',90,1.05,-8,1.25,.4,.58,mats.darkMetal);
for(const x of [-.48,.48]){const spool=new THREE.Mesh(new THREE.TorusGeometry(.2,.04,6,12),mats.rust);spool.position.set(90+x,1.18,-8.31);scene.add(spool);}
shelf(113,-8);shelf(107,-8,Math.PI);table(110,-8,2.2,1.1);box('e2 archive recorder',110,.99,-8,1.05,.32,.54,mats.darkMetal);table(90,8,2.2,1.05);box('e2 studio microphone',90,1.36,8,.13,.75,.13,mats.metal);box('e2 mic base',90,1.02,8,.46,.08,.46,mats.darkMetal);
for(let i=0;i<3;i++){box('e2 rack',110+i*.55,1.35,8,.49,2.7,.55,mats.darkMetal,{collider:true});box('e2 rack light',110+i*.55,2.2,7.69,.15,.12,.035,new THREE.MeshBasicMaterial({color:i===1?0x963c2d:0x607263}));}
box('e2 generator base',100,.28,-27,3.7,.55,2.4,mats.darkMetal,{collider:true});
const e2GeneratorBody=box('e2 generator',100,1.35,-27,3.2,1.65,2,mats.metal,{collider:true});
table(105,-26,1.8,.9);
const e2GeneratorLamp=new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),new THREE.MeshStandardMaterial({color:0x872f22,emissive:0x30100a}));e2GeneratorLamp.position.set(100,1.4,-25.93);scene.add(e2GeneratorLamp);
const e2GeneratorRotor=new THREE.Group();e2GeneratorRotor.position.set(101,1.38,-25.93);scene.add(e2GeneratorRotor);
for(let i=0;i<4;i++){const pivot=new THREE.Group();pivot.rotation.z=i*Math.PI/2;const blade=new THREE.Mesh(new THREE.BoxGeometry(.1,.43,.055),mats.metal);blade.position.y=.23;pivot.add(blade);e2GeneratorRotor.add(pivot);}
const e2GeneratorPanel=box('e2 generator panel',100,1.28,-25.75,.75,.62,.12,mats.darkMetal);
table(94,-44,2.4,1.1);shelf(94,-42,Math.PI/2);box('e2 transmitter console',100,1.12,-45.1,3.7,.42,.8,mats.metal,{collider:true});
box('e2 transmitter screen',100,1.75,-45.2,2.5,.76,.08,new THREE.MeshBasicMaterial({color:0x293b35}));
const e2SignalLight=new THREE.Mesh(new THREE.SphereGeometry(.12,10,8),new THREE.MeshStandardMaterial({color:0x903b2a,emissive:0x250b07}));e2SignalLight.position.set(101.45,1.78,-45.1);scene.add(e2SignalLight);
const e2DialMeshes=[];
for(let i=0;i<3;i++){const dial=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.12,12),new THREE.MeshStandardMaterial({color:0x9a6245,metalness:.7,roughness:.4}));dial.rotation.x=Math.PI/2;dial.position.set(99.15+i*.85,1.15,-44.61);scene.add(dial);e2DialMeshes.push(dial);sign(`ПОЛОСА ${i+1}`,99.15+i*.85,2.17,-44.63,.9);}
const e2EvidenceRecords=[
  {id:'e2-operator-log',x:90,z:-8,title:'Катушка №1 · Голос',text:'24 октября, 02:10. Передатчик выключен, но в эфире идёт моя смена. Я слышу, как сама читаю этот журнал. Голос говорит, что Илья придёт через семь минут. Карточка частот лежит в архиве эфира.'},
  {id:'e2-frequency-card',x:110,z:-8,title:'Карточка частот',text:'Маршрут резервного сигнала: нижняя полоса — 5, средняя — 1, верхняя — 9. На обороте: «Не подавай несущую, пока не найдёшь все три катушки».'},
  {id:'e2-studio-transcript',x:90,z:8,title:'Расшифровка эфира',text:'Голос в эфире повторяет слова дежурного с задержкой в семь минут. Вчера он сказал: «Я закрыл дверь». Через семь минут дверь захлопнулась сама. Оксана записала: «Сигнал не предсказывает. Он вспоминает».'},
];
const e2MandatoryIds=['e2-operator-log','e2-frequency-card','e2-studio-transcript'];
function episode2RecordsFound(){return e2MandatoryIds.filter((id)=>world.ep2Evidence.has(id)).length;}
for(const record of e2EvidenceRecords){
  const item=new THREE.Group();item.position.set(record.x,.88,record.z);scene.add(item);
  for(const dx of [-.13,.13]){const reel=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.045,12),mats.darkMetal);reel.position.x=dx;item.add(reel);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.052,8),mats.rust);hub.position.set(dx,.012,0);item.add(hub);}
  const label=new THREE.Mesh(new THREE.BoxGeometry(.35,.025,.12),mats.paper);label.position.y=.04;item.add(label);
  interactables.push({type:'e2-record',object:item,x:record.x,z:record.z,record,active:false,label:`Прочитать: ${record.title}`});
}
const e2EvidenceObject=new THREE.Mesh(new THREE.BoxGeometry(.3,.08,.22),mats.rust);e2EvidenceObject.position.set(104.7,.94,-25.6);scene.add(e2EvidenceObject);
interactables.push({type:'e2-evidence',object:e2EvidenceObject,x:104.7,z:-25.6,id:'e2-repair-note',active:false,label:'Забрать ремонтную бирку'});
interactables.push({type:'e2-generator',object:e2GeneratorPanel,x:100,z:-25.3,active:false,label:'Подать питание на передатчик'});
interactables.push({type:'e2-gate',object:e2ServiceGate,x:100,z:-31.15,active:false,label:'Открыть северный шлюз'});
interactables.push({type:'e2-exit',object:e2ExitDoor,x:100,z:19.3,active:false,label:'Покинуть радиоцентр'});
for(let i=0;i<3;i++)interactables.push({type:'e2-dial',object:e2DialMeshes[i],x:99.15+i*.85,z:-44.61,index:i,active:false,label:`Настроить полосу ${i+1}`} );
const e2Battery1=new THREE.Group();e2Battery1.position.set(112,.32,7);scene.add(e2Battery1);const e2Cell=new THREE.Mesh(new THREE.BoxGeometry(.34,.5,.22),new THREE.MeshStandardMaterial({color:0x68725a,emissive:0x171d13}));e2Battery1.add(e2Cell);const e2CellCap=new THREE.Mesh(new THREE.BoxGeometry(.16,.08,.13),mats.rust);e2CellCap.position.y=.29;e2Battery1.add(e2CellCap);interactables.push({type:'e2-battery',object:e2Battery1,x:112,z:7,id:'e2-rack-cell',active:false,label:'Забрать элемент питания'});
box('e2 archive locker',113,1.3,8,.7,2.6,.7,mats.rust,{collider:true});interactables.push({type:'e2-hide',object:new THREE.Object3D(),x:112.2,z:8,active:false,label:'Спрятаться в шкафу'});
box('e2 studio cabinet',94.7,1.3,8,.7,2.6,.7,mats.darkMetal,{collider:true});interactables.push({type:'e2-hide',object:new THREE.Object3D(),x:93.9,z:8,active:false,label:'Спрятаться за шкафом'});

// Handheld flashlight, attached to the view so it follows mouse-look exactly.
const flashlight=new THREE.SpotLight(0xd8d5bd,0,28,Math.PI/5.2,0.56,1.05);
flashlight.position.set(0,0,0);flashlight.target.position.set(0,0,-1);camera.add(flashlight);camera.add(flashlight.target);scene.add(camera);
const flashlightFill=new THREE.PointLight(0xc9d2d3,0,4.5,1.4);flashlightFill.position.set(.12,-.2,-.35);camera.add(flashlightFill);

// The thing in the corridor is deliberately simple, angular and half-lost in fog.
const monster=new THREE.Group();scene.add(monster);
const monsterMat=new THREE.MeshStandardMaterial({color:0x090d0e,roughness:1,emissive:0x090d0e});
const silhouette=new THREE.Mesh(new THREE.CapsuleGeometry(.38,.95,4,6),monsterMat);silhouette.position.y=1.22;monster.add(silhouette);
const head=new THREE.Mesh(new THREE.SphereGeometry(.29,7,6),monsterMat);head.position.y=2.12;monster.add(head);
const monsterArms=[],monsterLegs=[];
for(const side of [-1,1]){
  const arm=new THREE.Group();arm.position.set(side*.34,1.76,0);monster.add(arm);const upper=new THREE.Mesh(new THREE.CapsuleGeometry(.12,.83,3,5),monsterMat);upper.position.y=-.42;arm.add(upper);const hand=new THREE.Mesh(new THREE.SphereGeometry(.15,6,5),monsterMat);hand.position.set(side*.02,-.91,.06);arm.add(hand);monsterArms.push(arm);
  const leg=new THREE.Group();leg.position.set(side*.19,.72,0);monster.add(leg);const lower=new THREE.Mesh(new THREE.CapsuleGeometry(.16,.63,3,5),monsterMat);lower.position.y=-.35;leg.add(lower);monsterLegs.push(leg);
}
const monsterEyes=[];
for(const x of [-.13,.13]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,6,6),new THREE.MeshBasicMaterial({color:0xb85137}));eye.position.set(x,2.15,.25);monster.add(eye);monsterEyes.push(eye);}
const monsterMouth=new THREE.Mesh(new THREE.BoxGeometry(.17,.035,.04),mats.black);monsterMouth.position.set(0,1.98,.27);monster.add(monsterMouth);
monster.position.set(0,0,-17);monster.visible=false;

function audioStart(){
  if(window.audioContext)return;
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
  const ctx=new Ctx(),master=ctx.createGain();master.gain.value=Number(localStorage.getItem('shift13-volume')||'.65');master.connect(ctx.destination);window.audioContext=ctx;window.masterGain=master;ctx.resume().catch(()=>{});
  const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
  osc.type='sawtooth';osc.frequency.value=49;filter.type='lowpass';filter.frequency.value=115;gain.gain.value=.018;
  osc.connect(filter).connect(gain).connect(master);osc.start();
  const osc2=ctx.createOscillator(),g2=ctx.createGain();osc2.type='sine';osc2.frequency.value=52.3;g2.gain.value=.009;osc2.connect(g2).connect(master);osc2.start();
  window.ambienceOsc=osc;window.ambienceGain=gain;
  const windBuffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),windData=windBuffer.getChannelData(0);let wind=0;
  for(let i=0;i<windData.length;i++){wind=wind*.985+(Math.random()*2-1)*.08;windData[i]=wind;}
  const windSource=ctx.createBufferSource(),windFilter=ctx.createBiquadFilter(),windGain=ctx.createGain();windSource.buffer=windBuffer;windSource.loop=true;windFilter.type='lowpass';windFilter.frequency.value=320;windGain.gain.value=.055;windSource.connect(windFilter).connect(windGain).connect(master);windSource.start();window.windGain=windGain;
  const heart=ctx.createOscillator(),heartGain=ctx.createGain();heart.type='sine';heart.frequency.value=48;heartGain.gain.value=0;heart.connect(heartGain).connect(master);heart.start();window.heartGain=heartGain;
  const voice=$('radio-voice'),voiceHigh=ctx.createBiquadFilter(),voiceLow=ctx.createBiquadFilter(),voiceGain=ctx.createGain(),voicePan=ctx.createStereoPanner();
  voiceHigh.type='highpass';voiceHigh.frequency.value=260;voiceLow.type='lowpass';voiceLow.frequency.value=3100;voiceGain.gain.value=.92;voicePan.pan.value=0;
  const voiceSource=ctx.createMediaElementSource(voice);voiceSource.connect(voiceHigh).connect(voiceLow).connect(voiceGain).connect(voicePan).connect(master);window.radioVoice=voice;window.radioVoiceGain=voiceGain;
}
function radioLine(file,caption,duration=5200){
  if(caption)subtitle(caption,duration);
  const voice=window.radioVoice||$('radio-voice');if(!voice)return Promise.resolve();
  if(window.radioLineFinish)window.radioLineFinish(false);voice.pause();voice.currentTime=0;
  return new Promise((resolve)=>{
    let finished=false;const finish=(played=true)=>{if(finished)return;finished=true;if(window.radioLineFinish===finish)window.radioLineFinish=null;resolve(played);};window.radioLineFinish=finish;
    voice.addEventListener('ended',()=>finish(true),{once:true});voice.addEventListener('error',()=>finish(false),{once:true});
    if(caption)voice.addEventListener('loadedmetadata',()=>subtitle(caption,Math.max(duration,voice.duration*1000+450)),{once:true});
    voice.src=new URL(`assets/voice/${file}.ogg`,document.baseURI).href;voice.load();
    const play=voice.play();if(play&&typeof play.catch==='function')play.catch(()=>finish(false));
  });
}
function doorMotor(){
  const ctx=window.audioContext;if(!ctx)return;
  const osc=ctx.createOscillator(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();osc.type='sawtooth';osc.frequency.setValueAtTime(115,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(43,ctx.currentTime+1.35);filter.type='lowpass';filter.frequency.value=460;gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.linearRampToValueAtTime(.075,ctx.currentTime+.12);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+1.4);osc.connect(filter).connect(gain).connect(window.masterGain||ctx.destination);osc.start();osc.stop(ctx.currentTime+1.45);
}
function openDoor(door){
  if(!door.visible)return;
  const collider=colliders.findIndex(c=>Math.abs(c.x-door.position.x)<.01&&Math.abs(c.z-door.position.z)<.01&&c.hx<2);
  if(collider>=0)colliders.splice(collider,1);
  doorMotor();tweenProperty(door.position,'y',door.position.y+3.5,1.45,'smooth',()=>{door.visible=false;});
}
function ambientUpdate(){
  if(!world.active||!window.audioContext)return;
  const tunnel=world.episode===2?player.z<-20:player.z<-28,near=world.monsterAwake?distance(monster.position.x,monster.position.z):40;
  if(window.ambienceOsc)window.ambienceOsc.frequency.setTargetAtTime(tunnel?43:51,window.audioContext.currentTime,.8);
  if(window.ambienceGain)window.ambienceGain.gain.setTargetAtTime(tunnel?.027:.018,window.audioContext.currentTime,.7);
  if(window.windGain)window.windGain.gain.setTargetAtTime(tunnel?.085:.045,window.audioContext.currentTime,1.2);
  if(window.heartGain)window.heartGain.gain.setTargetAtTime(near<10?(10-near)*.0035:0,window.audioContext.currentTime,.25);
}
function playRadioNoise(duration=.55){
  const ctx=window.audioContext;if(!ctx)return;
  const length=Math.max(1,Math.floor(ctx.sampleRate*duration)),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length)*.35;
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.value=1250;filter.Q.value=.6;gain.gain.value=.12;source.connect(filter).connect(gain).connect(window.masterGain||ctx.destination);source.start();
}
function footstep(crouched=false){
  const ctx=window.audioContext;if(!ctx)return;
  const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(crouched?95:72,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(38,ctx.currentTime+.075);gain.gain.setValueAtTime(crouched?.012:.025,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.09);osc.connect(gain).connect(window.masterGain||ctx.destination);osc.start();osc.stop(ctx.currentTime+.1);
}
function beep(freq=680,duration=.12,volume=.035){
  const ctx=window.audioContext;if(!ctx)return;const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(freq,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.72,ctx.currentTime+duration);g.gain.setValueAtTime(volume,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);o.connect(g).connect(window.masterGain||ctx.destination);o.start();o.stop(ctx.currentTime+duration);
}
function subtitle(text,duration=3200){const el=$('subtitle');el.textContent=text;el.style.fontSize=`${localStorage.getItem('shift13-subtitle-size')||12}px`;el.classList.remove('hidden');clearTimeout(subtitle.timer);subtitle.timer=setTimeout(()=>el.classList.add('hidden'),duration);}
function toast(text,duration=2300){const el=$('toast');el.textContent=text;el.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),duration);}
const journalEntries=[];
let letterOpen=false,choiceOpen=false,journalOpen=false;
let hasSavedGame=false;
const saveKeyFor=(episode)=>`shift13-save-ep${episode}`;
function migrateMouseSettings(){
  if(localStorage.getItem('shift13-input-version')==='2')return;
  const oldValue=Number(localStorage.getItem('shift13-sensitivity'));
  if(Number.isFinite(oldValue)&&oldValue>0){
    const safer=oldValue<=.0007001?.00005:oldValue*.2142857;
    localStorage.setItem('shift13-sensitivity',String(THREE.MathUtils.clamp(safer,.00005,.0025)));
  }
  localStorage.setItem('shift13-input-version','2');
}
function saveCheckpoint(){
  if(world.ended)return;
  const snapshot={episode:world.episode,phase:world.phase,fuses:world.fuses,fuseIds:[...world.fuseIds],batteries:[...world.batteries],generator:world.generator,monsterAwake:world.monsterAwake,tape:world.tape,dials:world.dials,signalTuned:world.signalTuned,ending:world.ending,evidence:[...world.evidence],ep2Evidence:[...world.ep2Evidence],ep2Dials:world.ep2Dials,ep2Power:world.ep2Power,ep2Ending:world.ep2Ending,previousEnding:world.previousEnding,journal:journalEntries,player:{x:player.x,z:player.z,yaw:world.yaw},battery:world.battery,elapsedSeconds:world.elapsedSeconds||0};
  try{localStorage.setItem(saveKeyFor(world.episode),JSON.stringify(snapshot));localStorage.setItem('shift13-active-episode',String(world.episode));hasSavedGame=true;world.saveTimer=15;updateChapterMenu();}catch{}
}
function restoreCheckpoint(){
  let data;
  try{
    let activeEpisode=Number(localStorage.getItem('shift13-active-episode')||1);let saved=localStorage.getItem(saveKeyFor(activeEpisode));
    if(!saved){const legacy=localStorage.getItem('shift13-save');if(legacy){data=JSON.parse(legacy);activeEpisode=data.episode||1;localStorage.setItem(saveKeyFor(activeEpisode),legacy);localStorage.setItem('shift13-active-episode',String(activeEpisode));localStorage.removeItem('shift13-save');}else return false;}
    else data=JSON.parse(saved);
  }catch{return false;}
  if(!data)return false;
  try{
    world.episode=data.episode||1;world.phase=data.phase||'fuses';world.fuses=data.fuses||0;world.fuseIds=new Set(data.fuseIds||[]);world.batteries=new Set(data.batteries||[]);world.generator=!!data.generator;world.monsterAwake=!!data.monsterAwake;world.tape=!!data.tape;world.dials=Array.isArray(data.dials)?data.dials:[0,0,0];world.signalTuned=!!data.signalTuned;world.ending=data.ending||null;world.evidence=new Set(data.evidence||[]);world.ep2Evidence=new Set(data.ep2Evidence||[]);world.ep2Dials=Array.isArray(data.ep2Dials)?data.ep2Dials:[0,0,0];world.ep2Power=!!data.ep2Power;world.ep2Ending=data.ep2Ending||null;world.previousEnding=data.previousEnding||null;world.battery=Number.isFinite(data.battery)?data.battery:1;world.elapsedSeconds=data.elapsedSeconds||0;
    if(data.player){player.x=data.player.x;player.z=data.player.z;world.yaw=data.player.yaw||0;}
    if(Array.isArray(data.journal))journalEntries.push(...data.journal);
    for(const item of interactables){
      if(item.type==='fuse'&&world.fuseIds.has(item.index)){item.active=false;item.object.visible=false;}
      if(item.type==='record'&&world.evidence.has(item.record.id)){item.active=false;item.object.visible=false;}
      if(item.type==='evidence'&&world.evidence.has(item.id)){item.active=false;item.object.visible=false;}
      if(item.type==='tape'&&world.tape){item.active=false;item.object.visible=false;}
      if(item.type==='generator'&&world.generator)item.active=false;
      if(item.type==='battery'&&world.batteries.has(item.id)){item.active=false;item.object.visible=false;}
      if(item.type.startsWith('e2-'))item.active=world.episode===2;
      if(item.type==='e2-record'&&world.ep2Evidence.has(item.record.id)){item.active=false;item.object.visible=false;}
      if(item.type==='e2-evidence'&&world.ep2Evidence.has(item.id)){item.active=false;item.object.visible=false;}
      if(item.type==='e2-battery'&&world.batteries.has(item.id)){item.active=false;item.object.visible=false;}
      if(item.type==='e2-generator'&&world.ep2Power)item.active=false;
    }
    if(world.generator){generatorLamp.material.color.setHex(0x83ac83);generatorLamp.material.emissive=new THREE.Color(0x32683b);}
    const gateOpen=world.phase==='tape'||world.phase==='dials'||world.phase==='choice'||world.phase==='escape';
    if(gateOpen){serviceGate.visible=false;const gateCollider=colliders.findIndex(c=>Math.abs(c.x)<.01&&Math.abs(c.z+28)<.01&&c.hx>1);if(gateCollider>=0)colliders.splice(gateCollider,1);const gateItem=interactables.find(item=>item.type==='gate');if(gateItem)gateItem.active=false;}
    if(world.signalTuned){signalLight.material.color.setHex(0x9ac08b);signalLight.material.emissive=new THREE.Color(0x386d40);}
    for(let i=0;i<3;i++)dialMeshes[i].rotation.z=world.dials[i]*Math.PI/5;
    if(world.ending){exitDoor.visible=false;const doorCollider=colliders.findIndex(c=>Math.abs(c.x)<.01&&Math.abs(c.z-20)<.01&&c.hx<2);if(doorCollider>=0)colliders.splice(doorCollider,1);}
    const e2GateOpen=world.phase==='e2-tune'||world.phase==='e2-choice'||world.phase==='e2-escape';
    if(e2GateOpen){e2ServiceGate.visible=false;const gateCollider=colliders.findIndex(c=>Math.abs(c.x-100)<.01&&Math.abs(c.z+32)<.01&&c.hx<2);if(gateCollider>=0)colliders.splice(gateCollider,1);const gateItem=interactables.find(item=>item.type==='e2-gate');if(gateItem)gateItem.active=false;}
    if(world.ep2Power){e2GeneratorLamp.material.color.setHex(0x83ac83);e2GeneratorLamp.material.emissive=new THREE.Color(0x32683b);}
    if(world.phase==='e2-choice'||world.phase==='e2-escape'){e2SignalLight.material.color.setHex(0x9ac08b);e2SignalLight.material.emissive.setHex(0x386d40);}
    if(world.ep2Ending){e2ExitDoor.visible=false;const doorCollider=colliders.findIndex(c=>Math.abs(c.x-100)<.01&&Math.abs(c.z-20)<.01&&c.hx<2);if(doorCollider>=0)colliders.splice(doorCollider,1);}
    for(let i=0;i<3;i++)e2DialMeshes[i].rotation.z=world.ep2Dials[i]*Math.PI/5;
    if(world.monsterAwake){monster.visible=true;monster.position.set(world.episode===2?100:0,0,world.episode===2?-17:world.tape?-35:-16.7);}
    updateJournal();refreshObjective();updateFlashlight();$('start-button').querySelector('span').textContent=`ПРОДОЛЖИТЬ · ЭПИЗОД ${world.episode}`;$('new-game-button').classList.remove('hidden');
    return true;
  }catch{return false;}
}
function updateChapterMenu(){
  const unlocked=localStorage.getItem('shift13-ep2-unlocked')==='1';
  $('start-button').querySelector('span').textContent=hasSavedGame?`ПРОДОЛЖИТЬ · ЭПИЗОД ${world.episode}`:unlocked?'НАЧАТЬ ЭПИЗОД I':'НАЧАТЬ СМЕНУ';
  $('episode1-menu-button').classList.toggle('hidden',!unlocked);$('episode2-menu-button').classList.toggle('hidden',!unlocked);
  if(unlocked)$('episode2-menu-button').textContent=localStorage.getItem(saveKeyFor(2))?'ПРОДОЛЖИТЬ · ЭПИЗОД II «БЕЛЫЙ ШУМ»':'НАЧАТЬ · ЭПИЗОД II «БЕЛЫЙ ШУМ»';
  $('new-game-button').classList.toggle('hidden',!localStorage.getItem(saveKeyFor(1))&&!localStorage.getItem(saveKeyFor(2)));
  if(hasSavedGame&&world.episode===2){
    document.querySelector('.title-rule b').textContent='БЕЛЫЙ ШУМ';
    document.querySelector('.story').textContent='24 октября 1998-го. В районном радиоцентре Оксана слышит собственный голос в эфире. Илья возвращается за тремя катушками и находит сигнал, который помнит его прошлое решение.';
    document.querySelector('.build-stamp').innerHTML='ЭПИЗОД II · РАЙОННЫЙ РАДИОЦЕНТР <span>·</span> 8–12 МИНУТ';
  }
}
function setObjective(chapter,title,progress){
  $('chapter-name').textContent=chapter;
  $('objective-text').childNodes[0].textContent=`${title} `;
  $('fuse-count').textContent=progress;
}
function refreshObjective(){
  if(world.episode===2){
    if(world.phase==='e2-records')setObjective('ЭПИЗОД II · БЕЛЫЙ ШУМ','Найти три катушки эфира',`${episode2RecordsFound()} / 3`);
    else if(world.phase==='e2-power')setObjective('ЭПИЗОД II · БЕЛЫЙ ШУМ','Запустить резервный генератор','КАТУШКИ НАЙДЕНЫ');
    else if(world.phase==='e2-gate')setObjective('ЭПИЗОД II · БЕЛЫЙ ШУМ','Открыть северный шлюз','ПИТАНИЕ ЕСТЬ');
    else if(world.phase==='e2-tune')setObjective('ЭПИЗОД II · ПЕРЕДАТЧИК','Настроить несущую частоту',world.ep2Dials.join(' · '));
    else if(world.phase==='e2-choice')setObjective('ЭПИЗОД II · БЕЛЫЙ ШУМ','Решить судьбу сигнала',`${world.ep2Evidence.size} УЛИК`);
    else setObjective('ЭПИЗОД II · ВЫХОД','Покинуть радиоцентр','СЕТЬ ОТКЛЮЧЕНА');
    return;
  }
  if(world.phase==='fuses')setObjective('ГЛАВА I · МЁРТВАЯ ЛИНИЯ','Найти предохранители',`${world.fuses} / 3`);
  else if(world.phase==='generator')setObjective('ГЛАВА I · МЁРТВАЯ ЛИНИЯ','Запустить резервный генератор','ГОТОВО');
  else if(world.phase==='gate')setObjective('ГЛАВА II · ПОД ЗЕМЛЁЙ','Открыть сервисный шлюз','ПИТАНИЕ ЕСТЬ');
  else if(world.phase==='tape')setObjective('ГЛАВА II · ПОД ЗЕМЛЁЙ','Найти мастер-ленту','АРХИВ ЛЕНТ');
  else if(world.phase==='dials')setObjective('ГЛАВА III · ЛИНИЯ ЧЕТЫРЕ','Восстановить последовательность',world.dials.join(' · '));
  else if(world.phase==='choice')setObjective('ГЛАВА III · ЛИНИЯ ЧЕТЫРЕ','Выбрать, что делать с записью',`${world.evidence.size} ДОКАЗАТЕЛЬСТВ`);
  else setObjective('ГЛАВА IV · ДО РАССВЕТА','Добраться до выхода','СИГНАЛ ОТКЛЮЧЁН');
}
function updateJournal(){
  const content=$('journal-content');
  if(!journalEntries.length){content.innerHTML='<div class="journal-empty">Пока пусто. Ищи журналы, бирки кабеля и записи смены — по отдельности они выглядят случайными, но вместе складываются в картину.</div>';return;}
  content.innerHTML=`<div class="journal-list">${journalEntries.map((item)=>`<div class="journal-entry"><strong>${item.title}</strong>${item.text}</div>`).join('')}</div>`;
}
function showDocument(title,text){
  $('letter').textContent=`${title}\n\n${text}`;$('letter').classList.remove('hidden');letterOpen=true;beep(410,.12,.018);
}
function lockPointer(){
  try{const request=renderer.domElement.requestPointerLock?.();if(request&&typeof request.catch==='function')request.catch(()=>toast('ЩЁЛКНИ ПО ИГРЕ, ЧТОБЫ ЗАХВАТИТЬ МЫШЬ',2600));}catch{toast('ЩЁЛКНИ ПО ИГРЕ, ЧТОБЫ ЗАХВАТИТЬ МЫШЬ',2600);}
}
function begin(){
  if(world.episode===2){document.querySelector('.station-tag').innerHTML='<span class="status-dot"></span> РАЙОННЫЙ РАДИОЦЕНТР <span class="tag-divider">/</span> <span id="clock-display">03:17</span>';$('radio-text').textContent='РАЙОННАЯ СЕТЬ · ОКСАНА';}
  $('overlay').classList.add('hidden');$('hud').classList.remove('hidden');world.active=true;world.paused=false;audioStart();lockPointer();
  refreshObjective();updateStationClock();
  if(hasSavedGame)subtitle('СМЕНА ПРОДОЛЖЕНА · ТВОИ ЗАПИСИ И ПРЕДМЕТЫ СОХРАНЕНЫ.',3300);
  else{subtitle('СЛУЖЕБНЫЙ ЖУРНАЛ · 17 ОКТЯБРЯ 1998 · 03:17\n«Илья, если слышишь меня — не включай четвёртую линию».',5400);setTimeout(()=>{if(world.active)radioLine('sokolov-opening','Соколов по рации: «Сначала подай питание. Архив за шлюзом. Я встречу тебя у выхода».',5800);},6100);}
  saveCheckpoint();
  if(world.phase==='choice'&&world.signalTuned)setTimeout(()=>{if(world.active)showChoices();},500);
  if(world.phase==='e2-choice'&&world.ep2Power)setTimeout(()=>{if(world.active)showEpisode2Choices();},500);
}
function pause(){
  if(!world.active||world.ended||journalOpen||choiceOpen)return;
  world.paused=true;world.active=false;
  $('overlay').innerHTML=`<div class="menu-card"><div class="eyebrow"><span class="eyebrow-line"></span> СМЕНА ПРИОСТАНОВЛЕНА</div><h1 style="font-size:clamp(64px,10vw,110px)">ТИШЕ.</h1><p class="story">Станция никуда не денется. Надеюсь.</p><div class="settings-panel"><label>ЧУВСТВИТЕЛЬНОСТЬ МЫШИ <input id="sensitivity-setting" type="range" min="0.00005" max="0.0025" step="0.00005" value="0.00045"></label><label class="setting-toggle">ОБРАТНАЯ ОСЬ X <input id="invert-x-setting" type="checkbox"></label><label>ГРОМКОСТЬ <input id="volume-setting" type="range" min="0" max="1" step="0.05" value="0.65"></label><label>РАЗМЕР СУБТИТРОВ <input id="subtitle-setting" type="range" min="10" max="20" step="1" value="12"></label></div><button id="resume-button" class="start-button"><span>ВЕРНУТЬСЯ</span><b>↗</b></button><div class="menu-footer"><span>ESC — продолжить</span><span>J — журнал</span></div></div>`;
  $('overlay').classList.remove('hidden');document.exitPointerLock?.();
  const sensitivity=$('sensitivity-setting'),volume=$('volume-setting'),subtitleSize=$('subtitle-setting'),invertX=$('invert-x-setting');sensitivity.value=localStorage.getItem('shift13-sensitivity')||'0.00045';volume.value=localStorage.getItem('shift13-volume')||'.65';subtitleSize.value=localStorage.getItem('shift13-subtitle-size')||'12';invertX.checked=localStorage.getItem('shift13-invert-x')==='1';
  sensitivity.addEventListener('input',()=>localStorage.setItem('shift13-sensitivity',sensitivity.value));
  volume.addEventListener('input',()=>{localStorage.setItem('shift13-volume',volume.value);if(window.masterGain)window.masterGain.gain.value=Number(volume.value);});
  subtitleSize.addEventListener('input',()=>{localStorage.setItem('shift13-subtitle-size',subtitleSize.value);$('subtitle').style.fontSize=`${subtitleSize.value}px`;});
  invertX.addEventListener('change',()=>localStorage.setItem('shift13-invert-x',invertX.checked?'1':'0'));
  $('resume-button').onclick=resume;
}
function resume(){world.paused=false;world.active=true;$('overlay').classList.add('hidden');audioStart();lockPointer();}
function endGame(result){
  if(world.episode===2){finishEpisode2(result);return;}
  world.ended=true;world.active=false;document.exitPointerLock?.();$('hud').classList.add('hidden');
  const endings={
    broadcast:{title:'ЭФИР',text:'Ты отправил запись по аварийному каналу. На рассвете станция замолчала. Через неделю голос Лены услышали на десятках радиочастот — вместе с твоим именем и номером дела.'},
    erase:{title:'ТИШИНА',text:'Ты сжёг ленту и перерезал линию. Последний голос сестры оборвался на полуслове. Впервые за семь лет в рации стало по-настоящему тихо.'},
    truth:{title:'ПАМЯТЬ',text:'Ты передал журнал, акт и резервную запись в эфир, а затем закоротил линию четвёртого канала. Голос Лены успел сказать: «Теперь можешь идти». На этот раз ты поверил.'},
  };
  const ending=endings[result]||{title:'СИГНАЛ ПОТЕРЯН',text:'Тебе не удалось выбраться до рассвета. В журнале смены утром нашли только одну фразу: «Не отвечай, если услышишь своё имя».'};
  try{if(result){const endingsSeen=JSON.parse(localStorage.getItem('shift13-endings')||'[]');endingsSeen.push(result);localStorage.setItem('shift13-endings',JSON.stringify(endingsSeen));localStorage.setItem('shift13-last-ending',result);localStorage.setItem('shift13-ep2-unlocked','1');localStorage.removeItem(saveKeyFor(1));localStorage.setItem('shift13-active-episode','1');localStorage.removeItem('shift13-save');}}catch{}
  $('overlay').innerHTML=`<div class="menu-card"><div class="eyebrow"><span class="eyebrow-line"></span> ЗАПИСЬ СМЕНЫ · ${stationTime()}</div><h1 style="font-size:clamp(64px,10vw,110px)">${ending.title}</h1><p class="story">${ending.text}</p><p class="story">Доказательств собрано: ${world.evidence.size}. ${world.evidence.size<3?'В журнале остались незаполненные страницы.':''}</p><button id="restart-button" class="start-button"><span>${result?'ПЕРЕИГРАТЬ ЭПИЗОД I':'ВЕРНУТЬСЯ К КОНТРОЛЬНОЙ ТОЧКЕ'}</span><b>↗</b></button>${result?'<button id="episode2-button" class="new-game-button">ПЕРЕЙТИ К ЭПИЗОДУ II · БЕЛЫЙ ШУМ</button>':''}<div class="build-stamp">СМЕНА 13 <span>·</span> КОНЕЦ ЗАПИСИ</div></div>`;
  $('overlay').classList.remove('hidden');$('restart-button').onclick=()=>location.reload();$('episode2-button')?.addEventListener('click',selectEpisode2);
}
function finishEpisode2(result){
  world.ended=true;world.active=false;document.exitPointerLock?.();$('hud').classList.add('hidden');
  const endings={
    'e2-broadcast':{title:'ОБЩИЙ ЭФИР',text:'Ты передал запись всем районным частотам. На рассвете эфир замолчал. Оксана вышла из монтажной, но в каждом радиоприёмнике теперь хранится голос, который знает имена слушателей.'},
    'e2-jam':{title:'БЕЛЫЙ ШУМ',text:'Ты перегрузил передатчик. Несущая исчезла, а вместе с ней — голос Оксаны. Соколов нашёл тебя у двери. Он спросил, слышал ли ты своё имя после отключения.'},
    'e2-isolate':{title:'ЗАПЕРТЫЙ КОНТУР',text:'Ты отправил копию записей в архив и замкнул сигнал на пустой несущей. Город проснулся в тишине. На ленте остался один новый голос: «Илья, северный узел всё ещё работает».'},
  };
  const ending=endings[result]||{title:'СВЯЗЬ ПОТЕРЯНА',text:'Ты не успел выбраться из радиоцентра. Утром передатчик продолжал работать, хотя питание на щите было отключено.'};
  try{if(result){localStorage.setItem('shift13-ep2-ending',result);localStorage.removeItem(saveKeyFor(2));localStorage.setItem('shift13-active-episode','1');localStorage.removeItem('shift13-save');}}catch{}
  $('overlay').innerHTML=`<div class="menu-card"><div class="eyebrow"><span class="eyebrow-line"></span> РАЙОННЫЙ РАДИОЦЕНТР · ${stationTime()}</div><h1 style="font-size:clamp(64px,10vw,110px)">${ending.title}</h1><p class="story">${ending.text}</p><p class="story">Эпизод II завершён. Улик: ${world.ep2Evidence.size}.</p><button id="restart-button" class="start-button"><span>${result?'ВЕРНУТЬСЯ В МЕНЮ':'ЗАГРУЗИТЬ КОНТРОЛЬНУЮ ТОЧКУ'}</span><b>↗</b></button><div class="build-stamp">СЛЕДУЮЩИЙ ЭПИЗОД · «ГОЛОС»</div></div>`;
  $('overlay').classList.remove('hidden');$('restart-button').onclick=()=>location.reload();
}
function openJournal(){
  if(!world.active||letterOpen||choiceOpen)return;
  journalOpen=true;world.active=false;updateJournal();$('journal-panel').classList.remove('hidden');document.exitPointerLock?.();
}
function closeJournal(){if(!journalOpen)return;journalOpen=false;$('journal-panel').classList.add('hidden');if(!world.ended){world.active=true;lockPointer();}}
function showChoices(){
  choiceOpen=true;world.active=false;document.exitPointerLock?.();
  const options=[
    ['broadcast','ПЕРЕДАТЬ ЗАПИСЬ','Пусть все услышат, что произошло на линии четыре.'],
    ['erase','УНИЧТОЖИТЬ ЛЕНТУ','Оборвать сигнал. Не дать ему выйти за пределы узла.'],
  ];
  if(world.evidence.size>=3)options.push(['truth','ОСТАВИТЬ СЛЕД','Передать доказательства и закрыть линию изолированным контуром.']);
  $('choice-panel').innerHTML=`<div class="choice-eyebrow">ПОСЛЕДНЕЕ РЕШЕНИЕ · 03:51</div><h2>ГОЛОС ИЗ ЛИНИИ</h2><p>Лента трещит. В динамике — голос Лены, затем голос Соколова. «Илья, ты должен решить. Если пошлёшь запись — оно услышит другие станции. Если сотрёшь — никто не узнает, что мы здесь были».</p><p>Собранные доказательства: ${world.evidence.size}/3 ${world.evidence.size>=3?'· доступен особый вариант':''}</p><div class="choice-options">${options.map(([id,title,copy])=>`<button class="choice-option" data-ending="${id}"><b>${title}</b>${copy}</button>`).join('')}</div>`;
  $('choice-panel').classList.remove('hidden');$('choice-panel').querySelectorAll('[data-ending]').forEach((button)=>button.addEventListener('click',()=>chooseEnding(button.dataset.ending)));
}
function chooseEnding(ending){
  world.ending=ending;world.phase='escape';choiceOpen=false;$('choice-panel').classList.add('hidden');refreshObjective();
  openDoor(exitDoor);
  toast('ВЫХОД ОТКРЫТ · ВЕРНИСЬ К ЮЖНОЙ ДВЕРИ',3600);world.active=true;lockPointer();
  if(ending==='truth')radioLine('lena-truth','Лена по линии: «Теперь можешь идти. Я помню дорогу».',5000);
  else if(ending==='erase')radioLine('lena-erase','Лена по линии: «Хорошо. Теперь тишина. Я тебя люблю».',4800);
  else radioLine('sokolov-broadcast','Соколов: «Передача пошла. Илья, выходи. Оно услышало нас обоих».',5200);
  world.monsterAwake=true;world.monsterCaught=true;world.monsterState='hunt';
  saveCheckpoint();
}
function activateEpisode2(){for(const item of interactables)if(item.type.startsWith('e2-'))item.active=true;}
function startEpisode2(){
  if(localStorage.getItem('shift13-ep2-unlocked')!=='1'&&world.episode!==2)return;
  world.episode=2;world.phase='e2-records';world.ending=null;world.ep2Ending=null;world.ep2Power=false;world.ep2Dials=[0,0,0];world.ep2Evidence=new Set();world.previousEnding=localStorage.getItem('shift13-last-ending')||'erase';
  world.fuses=0;world.generator=false;world.tape=false;world.signalTuned=false;world.battery=1;world.stamina=1;world.hidden=false;world.monsterAwake=false;world.monsterCaught=false;world.lastNoise=0;world.walked=0;world.saveTimer=0;world.elapsedSeconds=0;world.episode=2;world.ended=false;world.paused=false;world.active=true;world.crouched=false;world.moving=false;
  player.x=100;player.z=15.7;world.yaw=0;world.pitch=0;monster.visible=false;e2ServiceGate.visible=true;e2ExitDoor.visible=true;e2GeneratorLamp.material.color.setHex(0x872f22);e2GeneratorLamp.material.emissive.setHex(0x30100a);e2SignalLight.material.color.setHex(0x903b2a);e2SignalLight.material.emissive.setHex(0x250b07);e2GeneratorBody.position.y=1.35;activateEpisode2();
  hasSavedGame=false;world.elapsedSeconds=0;document.querySelector('.station-tag').innerHTML='<span class="status-dot"></span> РАЙОННЫЙ РАДИОЦЕНТР <span class="tag-divider">/</span> <span id="clock-display">03:17</span>';$('overlay').classList.add('hidden');$('hud').classList.remove('hidden');$('episode2-menu-button').classList.add('hidden');$('radio-text').textContent='РАЙОННАЯ СЕТЬ · ОКСАНА';audioStart();lockPointer();refreshObjective();updateStationClock();saveCheckpoint();
  const consequence=world.previousEnding==='broadcast'?'После твоего эфира сигнал появился на семнадцати частотах.':world.previousEnding==='truth'?'Сохранённые улики привели тебя к районному передатчику.':'После отключения узла в журнале пропал целый час.';
  radioLine('oksana-opening',`24 ОКТЯБРЯ 1998 · 03:17 · ${consequence} Оксана: «Я слышу себя в эфире, но я молчу».`,7800);
}
function showEpisode2Choices(){
  choiceOpen=true;world.active=false;document.exitPointerLock?.();
  const branch=world.previousEnding==='broadcast'?'В первом эпизоде ты выпустил запись в эфир — городской диапазон уже заражён.':world.previousEnding==='truth'?'Собранные ранее улики помогли найти этот передатчик.':'После уничтожения первой ленты у тебя остался только сигнал и показания Оксаны.';
  const options=[['e2-broadcast','ПРЕДУПРЕДИТЬ ГОРОД','Передать запись на все районные частоты.'],['e2-jam','ЗАГЛУШИТЬ НЕСУЩУЮ','Перегрузить передатчик и оборвать сигнал.']];
  if(world.ep2Evidence.has('e2-repair-note'))options.push(['e2-isolate','ЗАМКНУТЬ КОНТУР','Сохранить копию и изолировать сигнал на пустой частоте.']);
  $('choice-panel').innerHTML=`<div class="choice-eyebrow">ЭПИЗОД II · ПОСЛЕДНЕЕ РЕШЕНИЕ</div><h2>КТО ГОВОРИТ В ЭФИРЕ?</h2><p>${branch}</p><p>Оксана говорит из монтажной: «Если откроешь городской канал, это услышат все. Если заглушишь — мы останемся здесь одни».</p><div class="choice-options">${options.map(([id,title,copy])=>`<button class="choice-option" data-ending="${id}"><b>${title}</b>${copy}</button>`).join('')}</div>`;
  $('choice-panel').classList.remove('hidden');$('choice-panel').querySelectorAll('[data-ending]').forEach((button)=>button.addEventListener('click',()=>chooseEpisode2(button.dataset.ending)));
}
function chooseEpisode2(ending){
  world.ep2Ending=ending;world.phase='e2-escape';choiceOpen=false;$('choice-panel').classList.add('hidden');refreshObjective();openDoor(e2ExitDoor);world.monsterAwake=true;world.monsterState='hunt';world.active=true;lockPointer();
  toast('ВЫХОД ОТКРЫТ · ВЕРНИСЬ К ЮЖНОМУ ВХОДУ',3500);radioLine(ending==='e2-broadcast'?'sokolov-broadcast':ending==='e2-isolate'?'lena-truth':'oksana-cut',ending==='e2-broadcast'?'Соколов: «Эфир пошёл. Илья, выходи — сигнал услышал весь район».':ending==='e2-isolate'?'Лена: «Контур закрыт. Теперь можешь идти».':'Оксана: «Связь пропала. Илья, ты ещё слышишь меня?»',5200);saveCheckpoint();
}
function replayEpisode1(){localStorage.removeItem(saveKeyFor(1));localStorage.setItem('shift13-active-episode','1');location.reload();}
function selectEpisode2(){
  if(localStorage.getItem(saveKeyFor(2))){localStorage.setItem('shift13-active-episode','2');location.reload();return;}
  startEpisode2();
}
function resetAllSaves(){for(const key of [saveKeyFor(1),saveKeyFor(2),'shift13-save','shift13-active-episode','shift13-ep2-unlocked','shift13-last-ending','shift13-endings','shift13-ep2-ending'])localStorage.removeItem(key);location.reload();}
migrateMouseSettings();
hasSavedGame=restoreCheckpoint();
updateChapterMenu();
$('start-button').addEventListener('click',begin);
$('start-button').disabled=false;
$('new-game-button').addEventListener('click',resetAllSaves);
$('episode1-menu-button').addEventListener('click',replayEpisode1);
$('episode2-menu-button').addEventListener('click',selectEpisode2);
$('journal-close').addEventListener('click',closeJournal);
let ignoreNextMouseMove=false;
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===renderer.domElement)ignoreNextMouseMove=true;
  else if(world.active&&!world.ended)pause();
});
document.addEventListener('mousemove',(e)=>{
  if(!world.active||document.pointerLockElement!==renderer.domElement)return;
  if(ignoreNextMouseMove){ignoreNextMouseMove=false;return;}
  const stored=Number(localStorage.getItem('shift13-sensitivity')||'0.00045');
  const sensitivity=THREE.MathUtils.clamp(Number.isFinite(stored)?stored:.00045,.00005,.0025);
  const dx=THREE.MathUtils.clamp(e.movementX,-300,300),dy=THREE.MathUtils.clamp(e.movementY,-300,300);
  const direction=localStorage.getItem('shift13-invert-x')==='1'?1:-1;
  world.yaw+=direction*THREE.MathUtils.clamp(dx*sensitivity,-.22,.22);
  world.pitch-=THREE.MathUtils.clamp(dy*sensitivity*.32,-.045,.045);
  world.pitch=THREE.MathUtils.clamp(world.pitch,-1.22,1.22);
});
document.addEventListener('keydown',(e)=>{
  if(e.code==='KeyJ'){if(journalOpen)closeJournal();else openJournal();return;}
  if(e.code==='Escape'){if(letterOpen){letterOpen=false;$('letter').classList.add('hidden');}else if(world.active)pause();else if(world.paused)resume();return;}
  if(!world.active)return;
  if(e.code==='KeyF'){
    if(world.battery<=0){toast('БАТАРЕЯ РАЗРЯЖЕНА · НАЙДИ ЭЛЕМЕНТ ПИТАНИЯ');return;}
    world.flashlight=!world.flashlight;updateFlashlight();beep(world.flashlight?580:260,.08,.018);
  }
  if(e.code==='KeyE')interact();
});
function updateFlashlight(){
  const power=world.battery<=0?0:world.flashlight?(world.battery<.18&&Math.sin(clock.elapsedTime*17)>0?0:92):0;
  flashlight.intensity=power;flashlightFill.intensity=power?3.2:0;
  $('light-state').textContent=world.flashlight&&world.battery>0?'ВКЛ':'ВЫКЛ';$('light-state').style.color=world.flashlight&&world.battery>0?'#c5ae7c':'#a6503c';
  $('battery-fill').style.width=`${Math.round(world.battery*100)}%`;$('battery-fill').style.background=world.battery<.2?'#ad4e3d':'#bdab70';$('battery-value').textContent=`${Math.round(world.battery*100)}%`;
}
updateFlashlight();

function distance(x,z,a=player.x,b=player.z){return Math.hypot(x-a,z-b);}
function currentTarget(){
  if(world.hidden)return {type:'hide-exit',active:true,label:'Покинуть укрытие'};
  let best=null,bestDist=2.15;
  for(const item of interactables){if(!item.active)continue;const d=distance(item.x,item.z);if(d>=bestDist)continue;
    const dx=item.x-player.x,dz=item.z-player.z,forwardX=-Math.sin(world.yaw),forwardZ=-Math.cos(world.yaw);const dot=(dx*forwardX+dz*forwardZ)/Math.max(.01,d);
    if(dot>.35){best=item;bestDist=d;}
  }
  return best;
}
function interact(){
  if(letterOpen){$('letter').classList.add('hidden');letterOpen=false;return;}
  const target=currentTarget();if(!target)return;
  if(target.type==='hide-exit'){world.hidden=false;world.hiddenSpot=null;$('hide-overlay').classList.add('hidden');subtitle('Ты выходишь из укрытия.',1500);return;}
  target.active=false;
  if(target.type==='fuse'){
    target.object.visible=false;world.fuses++;beep(760,.17,.04);toast(`ПРЕДОХРАНИТЕЛЬ ДОБАВЛЕН · ${world.fuses}/3`);
    world.fuseIds.add(target.index);
    if(world.fuses===1){world.monsterAwake=true;world.monsterState='watching';monster.visible=true;monster.position.set(0,0,-16.7);stinger('#b5573b',.46);radioLine('sokolov-warning','Рация · Соколов: «Илья? Ты тоже видел свет? Не смотри в конец коридора».',4800);$('radio-text').textContent='РАЦИЯ · ВХОДЯЩИЙ СИГНАЛ';}
    if(world.fuses===2){stinger('#a33f31',.24);tweenProperty(alarmGlow,'intensity',3.5,.18);setTimeout(()=>tweenProperty(alarmGlow,'intensity',0,.8),3200);radioLine('lena-signal','Чужой голос из динамика: «Ты так долго меня искал. Не уходи опять».',4600);playRadioNoise(.8);}
    if(world.fuses===3){world.phase='generator';subtitle('Щитовая в северном конце. Проверь журнал перед запуском.',4200);$('radio-text').textContent='РАЦИЯ · СЛАБЫЙ НЕСУЩИЙ СИГНАЛ';}
    refreshObjective();
  } else if(target.type==='record'){
    if(!world.evidence.has(target.record.id)){world.evidence.add(target.record.id);journalEntries.push(target.record);updateJournal();}
    target.active=true;showDocument(target.record.title,target.record.text);world.lastNoise=Math.max(world.lastNoise,.2);
    if(target.record.id==='shift-log'&&!world.monsterAwake){world.monsterAwake=true;world.monsterState='watching';monster.visible=true;monster.position.set(0,0,-16.7);subtitle('Из рации: «Илья? Ты нашёл журнал? Не читай запись за семнадцатое».',4000);}
    refreshObjective();
  } else if(target.type==='battery'){
    world.battery=Math.min(1,world.battery+.42);world.batteries.add(target.id);target.object.visible=false;updateFlashlight();beep(820,.2,.03);toast('ЭЛЕМЕНТ ПИТАНИЯ · '+Math.round(world.battery*100)+'%');
  } else if(target.type==='hide'){
    target.active=true;world.hidden=true;world.hiddenSpot=target;world.lastNoise=Math.max(0,world.lastNoise-.35);$('hide-overlay').classList.remove('hidden');subtitle('Ты затаил дыхание. Нажми E, чтобы выйти.',2600);
  } else if(target.type==='gate'){
    if(!world.generator){target.active=true;toast('ШЛЮЗ ОБЕСТОЧЕН · НУЖЕН РЕЗЕРВНЫЙ ГЕНЕРАТОР');return;}
    openDoor(serviceGate);
    world.phase='tape';refreshObjective();beep(180,.45,.05);setTimeout(()=>beep(280,.32,.04),250);playRadioNoise(.7);radioLine('sokolov-gate','Голос Соколова из тоннеля: «Не открывай шлюз. Я уже внутри. Нет. Я ещё в диспетчерской».',5700);
  } else if(target.type==='tape'){
    world.tape=true;target.object.visible=false;world.phase='dials';world.monsterAwake=true;world.monsterState='hunt';refreshObjective();stinger('#d8ddd1',.34);tweenProperty(ambient,'intensity',.12,.28);setTimeout(()=>tweenProperty(ambient,'intensity',.3,1.1),600);
    journalEntries.push({title:'Мастер-лента Л-4',text:'Запись начинается голосом Лены: «Илья, не ищи меня в комнате. Я — в линии». Потом Соколов: «Ты включил её. Теперь она знает, где ты». На коробке мастер-ленты процарапаны цифры: 3 — 7 — 2.'});updateJournal();
    showDocument('МАСТЕР-ЛЕНТА Л-4','На записи голос твоей сестры звучит так, будто она стоит за спиной. «Илья, не ищи меня в комнате. Я — в линии».\n\nСоколов отвечает: «Ты включил её. Теперь она знает, где ты».\n\nНа коробке процарапано: 3 — 7 — 2. Коммутатор находится в соседнем помещении.');radioLine('lena-tape','Лена на мастер-ленте: «Илья, не включай линию четыре. Я не в комнате. Я в проводе».',5700).then((played)=>{if(played)radioLine('sokolov-tape','Соколов на записи: «Я не говорил этого. Кто сейчас говорит моим голосом?»',4300);});playRadioNoise(1.2);
    subtitle('Из глубины тоннеля доносится быстрый металлический стук.',3200);
  } else if(target.type==='evidence'){
    world.evidence.add(target.id);target.object.visible=false;toast('ДОКАЗАТЕЛЬСТВО ДОБАВЛЕНО В ЖУРНАЛ');journalEntries.push({title:target.id==='backup-reel'?'Резервная лента':'Лист настройки передатчика',text:target.id==='backup-reel'?'На второй дорожке слышно, как Соколов спорит с самим собой. Два голоса произносят одну фразу с разницей ровно в семь минут.':'На листе рукой Соколова: «Если собраны три записи — не жги мастер-ленту. Отправь копию и отключи контур вручную».'});updateJournal();refreshObjective();
  } else if(target.type==='generator'){
    if(world.fuses<3){target.active=true;toast(`НЕ ХВАТАЕТ ПРЕДОХРАНИТЕЛЕЙ · ${world.fuses}/3`);return;}
    world.generator=true;world.phase='gate';refreshObjective();generatorLamp.material.color.setHex(0x83ac83);generatorLamp.material.emissive=new THREE.Color(0x32683b);pointLight(0,1.4,-23.5,0x76a878,8,14);stinger('#d3c28e',.2);beep(180,.5,.06);setTimeout(()=>beep(360,.4,.04),280);toast('ГЕНЕРАТОР ЗАПУЩЕН · ОТКРЫТ СЕРВИСНЫЙ ШЛЮЗ',3500);
    $('radio-text').textContent='РАЦИЯ · КАНАЛ 4';radioLine('sokolov-generator','Соколов: «Питание вернулось. Иди в нижний архив. И не отвечай на четвёртую линию».',5200);world.monsterState=world.monsterAwake?'stalking':'dormant';
  } else if(target.type==='dial'){
    if(!world.tape){target.active=true;toast('НУЖНА МАСТЕР-ЛЕНТА · ПОСМОТРИ АРХИВ');return;}
    target.active=true;const i=target.index;world.dials[i]=(world.dials[i]+1)%10;dialMeshes[i].rotation.z=world.dials[i]*Math.PI/5;beep(430+world.dials[i]*36,.07,.012);refreshObjective();
    if(world.dials.join('')==='372'){
      world.signalTuned=true;world.phase='choice';signalLight.material.color.setHex(0x9ac08b);signalLight.material.emissive=new THREE.Color(0x386d40);refreshObjective();beep(720,.25,.04);setTimeout(()=>beep(930,.32,.035),240);radioLine('lena-signal','На всех линиях голос Лены: «Илья, теперь решай».',4300).then(()=>{if(!world.ended)showChoices();});
    }
  } else if(target.type==='exit'){
    if(!world.ending){target.active=true;toast('НЕТ ПИТАНИЯ · СНАЧАЛА ПРОЙДИ В НИЖНИЙ АРХИВ');return;}
    endGame(world.ending);return;
  } else if(target.type==='e2-record'){
    const record=target.record;if(!world.ep2Evidence.has(record.id)){world.ep2Evidence.add(record.id);journalEntries.push(record);updateJournal();}
    target.object.visible=false;const firstContact=!world.monsterAwake;
    if(firstContact){world.monsterAwake=true;monster.visible=true;monster.position.set(100,0,-17);world.monsterState='watching';stinger('#c5d0cc',.28);}
    if(episode2RecordsFound()>=3){world.phase='e2-power';subtitle('Три катушки собраны. Пора запустить передатчик.',3000);}
    refreshObjective();
    const readLog=()=>radioLine('oksana-log',`${record.title}. ${record.text}`,6800);
    if(firstContact)radioLine('sokolov-ep2','Соколов на записи: «Волков, ты всё-таки пришёл. Все три катушки — в монтажной».',5100).then((played)=>{if(played)readLog();});else readLog();
  } else if(target.type==='e2-evidence'){
    world.ep2Evidence.add(target.id);target.object.visible=false;journalEntries.push({title:'Ремонтная бирка',text:'Передатчик можно изолировать от городской сети через ручной байпас. Сначала сохрани копию эфира; после переключения несущая замкнётся внутри центра.'});updateJournal();refreshObjective();toast('НАЙДЕНА УЛИКА · РУЧНОЙ БАЙПАС');
  } else if(target.type==='e2-battery'){
    world.battery=Math.min(1,world.battery+.42);world.batteries.add(target.id);target.object.visible=false;updateFlashlight();beep(820,.2,.03);toast('ЭЛЕМЕНТ ПИТАНИЯ · '+Math.round(world.battery*100)+'%');
  } else if(target.type==='e2-hide'){
    target.active=true;world.hidden=true;world.hiddenSpot=target;world.lastNoise=Math.max(0,world.lastNoise-.35);$('hide-overlay').classList.remove('hidden');subtitle('Ты затаил дыхание. Нажми E, чтобы выйти.',2600);
  } else if(target.type==='e2-generator'){
    if(episode2RecordsFound()<3){target.active=true;toast('НЕ ХВАТАЕТ КАТУШЕК · '+episode2RecordsFound()+'/3');return;}
    world.ep2Power=true;target.active=false;world.phase='e2-gate';refreshObjective();e2GeneratorLamp.material.color.setHex(0x83ac83);e2GeneratorLamp.material.emissive=new THREE.Color(0x32683b);stinger('#c5b78c',.22);doorMotor();radioLine('sokolov-generator','Резервное питание пошло. Северный шлюз должен открыться.',4200);toast('ПИТАНИЕ ВОССТАНОВЛЕНО · ШЛЮЗ НА СЕВЕР');
  } else if(target.type==='e2-gate'){
    if(!world.ep2Power){target.active=true;toast('ШЛЮЗ ОБЕСТОЧЕН · ЗАПУСТИ РЕЗЕРВНЫЙ ГЕНЕРАТОР');return;}
    target.active=false;openDoor(e2ServiceGate);world.phase='e2-tune';refreshObjective();playRadioNoise(.6);subtitle('Внутри передатчика три полосы настройки. Карточка частот — в архиве эфира.',4200);
  } else if(target.type==='e2-dial'){
    if(world.phase!=='e2-tune'){target.active=true;toast('СНАЧАЛА ОТКРОЙ СЕВЕРНЫЙ ШЛЮЗ');return;}
    target.active=true;const i=target.index;world.ep2Dials[i]=(world.ep2Dials[i]+1)%10;e2DialMeshes[i].rotation.z=world.ep2Dials[i]*Math.PI/5;beep(460+world.ep2Dials[i]*30,.07,.012);refreshObjective();
    if(world.ep2Dials.join('')==='519'){
      world.phase='e2-choice';e2SignalLight.material.color.setHex(0x9ac08b);e2SignalLight.material.emissive.setHex(0x386d40);refreshObjective();stinger('#d0d8cb',.24);radioLine('oksana-tuned','Оксана: «Частота совпала. Это передача из северного узла».',5400).then(()=>{if(!world.ended)showEpisode2Choices();});
    }
  } else if(target.type==='e2-exit'){
    if(!world.ep2Ending){target.active=true;toast('СИГНАЛ ЕЩЁ ИДЁТ · РЕШИ, ЧТО ДЕЛАТЬ С ПЕРЕДАЧЕЙ');return;}
    endGame(world.ep2Ending);return;
  }
  saveCheckpoint();
}

const keys={};
document.addEventListener('keydown',e=>{keys[e.code]=true;});document.addEventListener('keyup',e=>{keys[e.code]=false;});
function blocked(x,z){
  const r=player.radius;
  if(world.episode===2){if(x<83.55||x>115.55||z>19.35||z< -47.45)return true;}
  else if(x < -17.55||x>15.55||z>19.35||z< -56.45)return true;
  for(const c of colliders){if(Math.abs(x-c.x)<c.hx+r&&Math.abs(z-c.z)<c.hz+r)return true;}
  return false;
}
function movement(dt){
  if(!world.active||letterOpen||choiceOpen||journalOpen||world.hidden)return;
  let forward=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0);
  let side=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
  const crouch=keys.ControlLeft||keys.ControlRight;world.crouched=crouch;
  const len=Math.hypot(forward,side);if(!len){world.moving=false;world.stamina=Math.min(1,world.stamina+dt*.19);$('stamina-fill').style.width=`${Math.round(world.stamina*100)}%`;return;}
  forward/=len;side/=len;const sprint=!crouch&&(keys.ShiftLeft||keys.ShiftRight);const speed=crouch?1.25:sprint&&world.stamina>.03?4.7:2.6;
  if(sprint)world.stamina=Math.max(0,world.stamina-dt*.28);else world.stamina=Math.min(1,world.stamina+dt*.17);
  $('stamina-fill').style.width=`${Math.round(world.stamina*100)}%`;
  const dx=(-Math.sin(world.yaw)*forward+Math.cos(world.yaw)*side)*speed*dt;
  const dz=(-Math.cos(world.yaw)*forward-Math.sin(world.yaw)*side)*speed*dt;
  if(!blocked(player.x+dx,player.z))player.x+=dx;
  if(!blocked(player.x,player.z+dz))player.z+=dz;
  world.moving=true;world.walked+=dt*speed;
  world.footstepTimer-=dt;
  if(world.footstepTimer<=0){footstep(crouch);world.footstepTimer=crouch?.68:sprint?.3:.5;if(!crouch){world.lastNoise=Math.max(world.lastNoise,sprint?.95:.28);world.noiseAt.x=player.x;world.noiseAt.z=player.z;}}
}
function updateMonster(dt){
  if(!world.active||!world.monsterAwake||world.ended||choiceOpen)return;
  const d=distance(monster.position.x,monster.position.z);
  world.lastNoise=Math.max(0,world.lastNoise-dt*.16);
  const stealthing=(world.hidden||world.crouched)&&world.lastNoise<.48&&d>4;
  const investigating=(world.hidden||world.crouched)&&world.lastNoise>=.48;
  let targetX=stealthing?monster.position.x:investigating?world.noiseAt.x:player.x;
  let targetZ=stealthing?monster.position.z:investigating?world.noiseAt.z:player.z;
  if(world.episode===2){
    if(targetZ<-32&&monster.position.z>-31){targetX=100;targetZ=-33.2;}
    else if(targetZ>-32&&monster.position.z<-33){targetX=100;targetZ=-30.8;}
    else if(targetZ<-20&&monster.position.z>-19){targetX=100;targetZ=-21.2;}
    else if(targetZ>-20&&monster.position.z<-21){targetX=100;targetZ=-18.8;}
    else if(targetZ>-20&&Math.abs(targetX-100)>4){
      const side=targetX<100?-1:1,doorX=100+side*4.45,doorwayZ=targetZ<-3?-8:targetZ>3?8:targetZ;
      targetX=100;targetZ=doorwayZ;
      if(Math.abs(monster.position.z-doorwayZ)<1.1)targetX=doorX;
      if(Math.abs(monster.position.x-doorX)<.7&&Math.abs(monster.position.z-doorwayZ)<1.1){targetX=player.x;targetZ=player.z;}
    }
  }
  // Navigate the actual doorways between the hall, cable tunnel, and archive wings.
  else if(targetZ<-28&&monster.position.z>-27){targetX=0;targetZ=-29.2;}
  else if(targetZ<-43&&monster.position.z>-42.2){targetX=0;targetZ=-44.2;}
  else if(targetZ>-28&&monster.position.z<-29){targetX=0;targetZ=-26.4;}
  else if(targetZ>-43&&monster.position.z<-44){targetX=0;targetZ=-42.1;}
  else if(targetZ<-43&&Math.abs(targetX)>8.5){
    const doorX=Math.sign(targetX)*8.5;targetX=doorX;targetZ=-50;
    if(Math.abs(monster.position.x-doorX)<.9&&Math.abs(monster.position.z+50)<1.4){targetX=player.x;targetZ=player.z;}
  } else if(targetZ>-28&&Math.abs(targetX)>4.4){
    const doorwayZ=targetZ<-3?-8:targetZ>3?8:targetZ;
    targetX=0;targetZ=doorwayZ;
    if(Math.abs(monster.position.z-doorwayZ)<1.1)targetX=Math.sign(player.x)*4.45;
    if(Math.abs(monster.position.x-Math.sign(player.x)*4.45)<.7&&Math.abs(monster.position.z-doorwayZ)<1.1){targetX=player.x;targetZ=player.z;}
  }
  const dx=targetX-monster.position.x,dz=targetZ-monster.position.z;
  const toMonster=new THREE.Vector3((investigating?world.noiseAt.x:player.x)-monster.position.x,0,(investigating?world.noiseAt.z:player.z)-monster.position.z).normalize();
  const look=new THREE.Vector3(-Math.sin(world.yaw),0,-Math.cos(world.yaw));
  const facing=look.dot(toMonster)>.62;
  const lit=facing&&world.flashlight&&world.battery>0&&d<14;
  monsterMat.emissive.setHex(lit?0x29140e:0x090d0e);
  const speed=world.episode===2?(world.phase==='e2-escape'?1.28:world.ep2Power?.68:.36):(world.phase==='escape'?1.28:world.tape?.9:world.generator?.58:.34);
  const pathDistance=Math.hypot(dx,dz);
  const walking=!lit&&pathDistance>.35;
  if(walking){monster.position.x+=dx/pathDistance*speed*dt;monster.position.z+=dz/pathDistance*speed*dt;}
  monster.lookAt(investigating?world.noiseAt.x:player.x,1.2,investigating?world.noiseAt.z:player.z);
  monster.position.y=Math.sin(clock.elapsedTime*3)*.035;
  const stride=walking?Math.sin(clock.elapsedTime*8)*.55:0;
  monsterArms[0].rotation.x=stride;monsterArms[1].rotation.x=-stride;
  monsterLegs[0].rotation.x=-stride*.75;monsterLegs[1].rotation.x=stride*.75;
  head.rotation.z=Math.sin(clock.elapsedTime*1.8)*.09;head.rotation.x=Math.sin(clock.elapsedTime*2.3)*.05;
  const eyeGlow=d<8?.06:.035;for(const eye of monsterEyes)eye.scale.setScalar(eyeGlow/.035);
  if(d<1.15&&(!world.hidden||world.lastNoise>.72)){endGame(null);}
  if(d<8&&Math.random()<dt*.055){playRadioNoise(.18);}
}
function flickerLights(){
  const t=clock.elapsedTime;
  scene.traverse(o=>{if(o.isPointLight&&o.position.y>2.8&&o.position.y<3.1){const seed=Math.floor((o.position.x+20)*7+o.position.z*3);o.intensity=(Math.sin(t*2.2+seed)*.5+.5)>.985?0.12:(o.userData.base??(o.userData.base=o.intensity));}});
}
function animate(){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.045);
  movement(dt);
  if(world.active){
    world.elapsedSeconds+=dt;world.saveTimer-=dt;
    if(world.saveTimer<=0){
      const threatDistance=world.monsterAwake?distance(monster.position.x,monster.position.z):Infinity;
      if(world.hidden||threatDistance>10){saveCheckpoint();world.saveTimer=15;}else world.saveTimer=2;
    }
  }
  world.clockTimer-=dt;if(world.clockTimer<=0){updateStationClock();world.clockTimer=1;}
  if(world.active&&world.flashlight&&world.battery>0){world.battery=Math.max(0,world.battery-dt*.00165);if(world.battery===0){toast('ФОНАРЬ ПОГАС · БАТАРЕЯ РАЗРЯЖЕНА',3500);world.flashlight=false;}updateFlashlight();}
  updateTweens();
  if(world.generator){generatorRotor.rotation.z+=dt*8;generatorBody.position.y=1.35+Math.sin(clock.elapsedTime*14)*.012;}
  if(world.ep2Power){e2GeneratorRotor.rotation.z+=dt*8;e2GeneratorBody.position.y=1.35+Math.sin(clock.elapsedTime*14)*.012;}
  const shake=world.cameraShake||0;if(shake>0)world.cameraShake=Math.max(0,shake-dt*.65);
  camera.position.set(player.x+(Math.random()-.5)*shake*.035,(keys.ControlLeft||keys.ControlRight?1.1:player.y)+(world.moving?Math.sin(world.walked*8)*.025:0)+(Math.random()-.5)*shake*.025,player.z);
  camera.rotation.set(world.pitch,world.yaw,world.moving?Math.sin(world.walked*4)*.006:0,'YXZ');
  for(const item of interactables){if(item.type==='fuse'&&item.active){item.object.rotation.y+=dt*.35;item.object.position.y=.7+Math.sin(clock.elapsedTime*2+item.index)*.045;}}
  const target=currentTarget();if(target&&world.active&&!letterOpen){$('prompt-text').textContent=target.label;$('prompt').classList.remove('hidden');}else $('prompt').classList.add('hidden');
  updateMonster(dt);if(world.audioTimer===undefined||world.audioTimer<=0){ambientUpdate();world.audioTimer=.3;}else world.audioTimer-=dt;flickerLights();renderer.render(scene,camera);
}
animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setSize(innerWidth,innerHeight);});
