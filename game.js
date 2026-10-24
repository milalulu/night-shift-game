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
const world = {
  active: false, paused: false, ended: false, fuses: 0, generator: false,
  monsterAwake: false, monsterCaught: false, monsterState: 'dormant',
  flashlight: true, battery: 1, yaw: 0, pitch: 0, moving: false, stamina: 1, walked: 0,
  crouched: false, hidden: false, phase: 'fuses', evidence: new Set(), fuseIds: new Set(), batteries: new Set(), tape: false,
  dials: [0, 0, 0], signalTuned: false, ending: null, lastNoise: 0, noiseAt: { x: 0, z: 0 }, footstepTimer: 0,
  saveTimer: 0,
};
const player = { x: 0, z: 15.6, y: 1.64, radius: .34 };

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
box('generator body',0,1.35,-25,3.1,1.65,2,mats.metal,{collider:true});
for(const x of [-1,0,1]){const vent=box('generator vent',x,1.42,-23.97,.09,.82,.035,mats.black);vent.rotation.z=.12;}
box('generator cap',0,2.24,-25,3.3,.16,2.15,mats.rust);
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

// Handheld flashlight, attached to the view so it follows mouse-look exactly.
const flashlight=new THREE.SpotLight(0xd8d5bd,0,28,Math.PI/5.2,0.56,1.05);
flashlight.position.set(0,0,0);flashlight.target.position.set(0,0,-1);camera.add(flashlight);camera.add(flashlight.target);scene.add(camera);
const flashlightFill=new THREE.PointLight(0xc9d2d3,0,4.5,1.4);flashlightFill.position.set(.12,-.2,-.35);camera.add(flashlightFill);

// The thing in the corridor is deliberately simple, angular and half-lost in fog.
const monster=new THREE.Group();scene.add(monster);
const monsterMat=new THREE.MeshStandardMaterial({color:0x090d0e,roughness:1,emissive:0x090d0e});
const silhouette=new THREE.Mesh(new THREE.CapsuleGeometry(.38,.95,4,6),monsterMat);silhouette.position.y=1.22;monster.add(silhouette);
const head=new THREE.Mesh(new THREE.SphereGeometry(.29,7,6),monsterMat);head.position.y=2.12;monster.add(head);
for(const x of [-.13,.13]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,6,6),new THREE.MeshBasicMaterial({color:0xb85137}));eye.position.set(x,2.15,.25);monster.add(eye);}
monster.position.set(0,0,-17);monster.visible=false;

function audioStart(){
  if(window.audioContext)return;
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
  const ctx=new Ctx(),master=ctx.createGain();master.gain.value=Number(localStorage.getItem('shift13-volume')||'.65');master.connect(ctx.destination);window.audioContext=ctx;window.masterGain=master;
  const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
  osc.type='sawtooth';osc.frequency.value=49;filter.type='lowpass';filter.frequency.value=115;gain.gain.value=.018;
  osc.connect(filter).connect(gain).connect(master);osc.start();
  const osc2=ctx.createOscillator(),g2=ctx.createGain();osc2.type='sine';osc2.frequency.value=52.3;g2.gain.value=.009;osc2.connect(g2).connect(master);osc2.start();
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
function subtitle(text,duration=3200){const el=$('subtitle');el.textContent=text;el.classList.remove('hidden');clearTimeout(subtitle.timer);subtitle.timer=setTimeout(()=>el.classList.add('hidden'),duration);}
function toast(text,duration=2300){const el=$('toast');el.textContent=text;el.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),duration);}
const journalEntries=[];
let letterOpen=false,choiceOpen=false,journalOpen=false;
let hasSavedGame=false;
function saveCheckpoint(){
  if(world.ended)return;
  const snapshot={phase:world.phase,fuses:world.fuses,fuseIds:[...world.fuseIds],batteries:[...world.batteries],generator:world.generator,monsterAwake:world.monsterAwake,tape:world.tape,dials:world.dials,signalTuned:world.signalTuned,ending:world.ending,evidence:[...world.evidence],journal:journalEntries,player:{x:player.x,z:player.z,yaw:world.yaw},battery:world.battery};
  try{localStorage.setItem('shift13-save',JSON.stringify(snapshot));hasSavedGame=true;}catch{}
}
function restoreCheckpoint(){
  let data;try{data=JSON.parse(localStorage.getItem('shift13-save')||'null');}catch{return false;}
  if(!data)return false;
  try{
    world.phase=data.phase||'fuses';world.fuses=data.fuses||0;world.fuseIds=new Set(data.fuseIds||[]);world.batteries=new Set(data.batteries||[]);world.generator=!!data.generator;world.monsterAwake=!!data.monsterAwake;world.tape=!!data.tape;world.dials=Array.isArray(data.dials)?data.dials:[0,0,0];world.signalTuned=!!data.signalTuned;world.ending=data.ending||null;world.evidence=new Set(data.evidence||[]);world.battery=Number.isFinite(data.battery)?data.battery:1;
    if(data.player){player.x=data.player.x;player.z=data.player.z;world.yaw=data.player.yaw||0;}
    if(Array.isArray(data.journal))journalEntries.push(...data.journal);
    for(const item of interactables){
      if(item.type==='fuse'&&world.fuseIds.has(item.index)){item.active=false;item.object.visible=false;}
      if(item.type==='record'&&world.evidence.has(item.record.id)){item.active=false;item.object.visible=false;}
      if(item.type==='evidence'&&world.evidence.has(item.id)){item.active=false;item.object.visible=false;}
      if(item.type==='tape'&&world.tape){item.active=false;item.object.visible=false;}
      if(item.type==='generator'&&world.generator)item.active=false;
      if(item.type==='battery'&&world.batteries.has(item.id)){item.active=false;item.object.visible=false;}
    }
    if(world.generator){generatorLamp.material.color.setHex(0x83ac83);generatorLamp.material.emissive=new THREE.Color(0x32683b);}
    const gateOpen=world.phase==='tape'||world.phase==='dials'||world.phase==='choice'||world.phase==='escape';
    if(gateOpen){serviceGate.visible=false;const gateCollider=colliders.findIndex(c=>Math.abs(c.x)<.01&&Math.abs(c.z+28)<.01&&c.hx>1);if(gateCollider>=0)colliders.splice(gateCollider,1);const gateItem=interactables.find(item=>item.type==='gate');if(gateItem)gateItem.active=false;}
    if(world.signalTuned){signalLight.material.color.setHex(0x9ac08b);signalLight.material.emissive=new THREE.Color(0x386d40);}
    for(let i=0;i<3;i++)dialMeshes[i].rotation.z=world.dials[i]*Math.PI/5;
    if(world.ending){exitDoor.visible=false;const doorCollider=colliders.findIndex(c=>Math.abs(c.x)<.01&&Math.abs(c.z-20)<.01&&c.hx<2);if(doorCollider>=0)colliders.splice(doorCollider,1);}
    if(world.monsterAwake){monster.visible=true;monster.position.set(0,0,world.tape?-35:-16.7);}
    updateJournal();refreshObjective();updateFlashlight();$('start-button').querySelector('span').textContent='ПРОДОЛЖИТЬ СМЕНУ';$('new-game-button').classList.remove('hidden');
    return true;
  }catch{return false;}
}
function setObjective(chapter,title,progress){
  $('chapter-name').textContent=chapter;
  $('objective-text').childNodes[0].textContent=`${title} `;
  $('fuse-count').textContent=progress;
}
function refreshObjective(){
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
  $('overlay').classList.add('hidden');$('hud').classList.remove('hidden');world.active=true;world.paused=false;audioStart();lockPointer();
  refreshObjective();
  if(hasSavedGame)subtitle('СМЕНА ПРОДОЛЖЕНА · ТВОИ ЗАПИСИ И ПРЕДМЕТЫ СОХРАНЕНЫ.',3300);
  else{subtitle('СЛУЖЕБНЫЙ ЖУРНАЛ · 17 ОКТЯБРЯ 1998 · 03:17\n«Илья, если слышишь меня — не включай четвёртую линию».',5400);setTimeout(()=>{if(world.active)subtitle('Рация · Соколов: «Сначала подай питание. Архив — за шлюзом. Я встречу тебя у выхода».',4600);},6100);}
  saveCheckpoint();
  if(world.phase==='choice'&&world.signalTuned)setTimeout(()=>{if(world.active)showChoices();},500);
}
function pause(){
  if(!world.active||world.ended||journalOpen||choiceOpen)return;
  world.paused=true;world.active=false;
  $('overlay').innerHTML=`<div class="menu-card"><div class="eyebrow"><span class="eyebrow-line"></span> СМЕНА ПРИОСТАНОВЛЕНА</div><h1 style="font-size:clamp(64px,10vw,110px)">ТИШЕ.</h1><p class="story">Станция никуда не денется. Надеюсь.</p><div class="settings-panel"><label>ЧУВСТВИТЕЛЬНОСТЬ МЫШИ <input id="sensitivity-setting" type="range" min="0.0007" max="0.004" step="0.0001" value="0.0021"></label><label>ГРОМКОСТЬ <input id="volume-setting" type="range" min="0" max="1" step="0.05" value="0.65"></label></div><button id="resume-button" class="start-button"><span>ВЕРНУТЬСЯ</span><b>↗</b></button><div class="menu-footer"><span>ESC — продолжить</span><span>J — журнал</span></div></div>`;
  $('overlay').classList.remove('hidden');document.exitPointerLock?.();
  const sensitivity=$('sensitivity-setting'),volume=$('volume-setting');sensitivity.value=localStorage.getItem('shift13-sensitivity')||'0.0021';volume.value=localStorage.getItem('shift13-volume')||'.65';
  sensitivity.addEventListener('input',()=>localStorage.setItem('shift13-sensitivity',sensitivity.value));
  volume.addEventListener('input',()=>{localStorage.setItem('shift13-volume',volume.value);if(window.masterGain)window.masterGain.gain.value=Number(volume.value);});
  $('resume-button').onclick=resume;
}
function resume(){world.paused=false;world.active=true;$('overlay').classList.add('hidden');audioStart();lockPointer();}
function endGame(result){
  world.ended=true;world.active=false;document.exitPointerLock?.();$('hud').classList.add('hidden');
  const endings={
    broadcast:{title:'ЭФИР',text:'Ты отправил запись по аварийному каналу. На рассвете станция замолчала. Через неделю голос Лены услышали на десятках радиочастот — вместе с твоим именем и номером дела.'},
    erase:{title:'ТИШИНА',text:'Ты сжёг ленту и перерезал линию. Последний голос сестры оборвался на полуслове. Впервые за семь лет в рации стало по-настоящему тихо.'},
    truth:{title:'ПАМЯТЬ',text:'Ты передал журнал, акт и резервную запись в эфир, а затем закоротил линию четвёртого канала. Голос Лены успел сказать: «Теперь можешь идти». На этот раз ты поверил.'},
  };
  const ending=endings[result]||{title:'СИГНАЛ ПОТЕРЯН',text:'Тебе не удалось выбраться до рассвета. В журнале смены утром нашли только одну фразу: «Не отвечай, если услышишь своё имя».'};
  try{if(result){const endingsSeen=JSON.parse(localStorage.getItem('shift13-endings')||'[]');endingsSeen.push(result);localStorage.setItem('shift13-endings',JSON.stringify(endingsSeen));localStorage.removeItem('shift13-save');}}catch{}
  $('overlay').innerHTML=`<div class="menu-card"><div class="eyebrow"><span class="eyebrow-line"></span> ЗАПИСЬ СМЕНЫ · 04:02</div><h1 style="font-size:clamp(64px,10vw,110px)">${ending.title}</h1><p class="story">${ending.text}</p><p class="story">Доказательств собрано: ${world.evidence.size}. ${world.evidence.size<3?'В журнале остались незаполненные страницы.':''}</p><button id="restart-button" class="start-button"><span>${result?'ПЕРЕИГРАТЬ ЭПИЗОД':'ВЕРНУТЬСЯ К КОНТРОЛЬНОЙ ТОЧКЕ'}</span><b>↗</b></button><div class="build-stamp">СМЕНА 13 <span>·</span> КОНЕЦ ЗАПИСИ</div></div>`;
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
  exitDoor.visible=false;const doorCollider=colliders.findIndex(c=>Math.abs(c.x)<.01&&Math.abs(c.z-20)<.01&&c.hx<2);if(doorCollider>=0)colliders.splice(doorCollider,1);
  toast('ВЫХОД ОТКРЫТ · ВЕРНИСЬ К ЮЖНОЙ ДВЕРИ',3600);subtitle(ending==='erase'?'Соколов: «Ты сделал правильно. Теперь уходи».':'Соколов: «Они уже слышали эфир. Беги, Илья».',3800);world.active=true;lockPointer();
  world.monsterAwake=true;world.monsterCaught=true;world.monsterState='hunt';
  saveCheckpoint();
}
hasSavedGame=restoreCheckpoint();
$('start-button').addEventListener('click',begin);
$('new-game-button').addEventListener('click',()=>{localStorage.removeItem('shift13-save');location.reload();});
$('journal-close').addEventListener('click',closeJournal);
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==renderer.domElement&&world.active&&!world.ended)pause();});
document.addEventListener('mousemove',(e)=>{if(!world.active||document.pointerLockElement!==renderer.domElement)return;const sensitivity=Number(localStorage.getItem('shift13-sensitivity')||'0.0021');world.yaw-=e.movementX*sensitivity;world.pitch-=e.movementY*sensitivity*.86;world.pitch=THREE.MathUtils.clamp(world.pitch,-1.3,1.3);});
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
    if(world.fuses===1){world.monsterAwake=true;world.monsterState='watching';monster.visible=true;monster.position.set(0,0,-16.7);subtitle('Рация · Соколов: «Я видел свет в конце коридора. Здесь никого нет. Ты слышал?»',4200);$('radio-text').textContent='РАЦИЯ · ВХОДЯЩИЙ СИГНАЛ';}
    if(world.fuses===2){subtitle('Лампы гаснут одна за другой. Что-то отвечает из закрытой линии.',3600);playRadioNoise(.8);}
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
    target.object.visible=false;const i=colliders.findIndex(c=>Math.abs(c.x)<.01&&Math.abs(c.z+28)<.01&&c.hx>1);if(i>=0)colliders.splice(i,1);
    world.phase='tape';refreshObjective();beep(180,.45,.05);setTimeout(()=>beep(280,.32,.04),250);playRadioNoise(.7);subtitle('За шлюзом Соколов говорит уже не по рации. Его голос идёт из тоннеля.',4500);
  } else if(target.type==='tape'){
    world.tape=true;target.object.visible=false;world.phase='dials';world.monsterAwake=true;world.monsterState='hunt';refreshObjective();
    journalEntries.push({title:'Мастер-лента Л-4',text:'Запись начинается голосом Лены: «Илья, не ищи меня в комнате. Я — в линии». Потом Соколов: «Ты включил её. Теперь она знает, где ты». На коробке мастер-ленты процарапаны цифры: 3 — 7 — 2.'});updateJournal();
    showDocument('МАСТЕР-ЛЕНТА Л-4','На записи голос твоей сестры звучит так, будто она стоит за спиной. «Илья, не ищи меня в комнате. Я — в линии».\n\nСоколов отвечает: «Ты включил её. Теперь она знает, где ты».\n\nНа коробке процарапано: 3 — 7 — 2. Коммутатор находится в соседнем помещении.');playRadioNoise(1.2);
    subtitle('Из глубины тоннеля доносится быстрый металлический стук.',3200);
  } else if(target.type==='evidence'){
    world.evidence.add(target.id);target.object.visible=false;toast('ДОКАЗАТЕЛЬСТВО ДОБАВЛЕНО В ЖУРНАЛ');journalEntries.push({title:target.id==='backup-reel'?'Резервная лента':'Лист настройки передатчика',text:target.id==='backup-reel'?'На второй дорожке слышно, как Соколов спорит с самим собой. Два голоса произносят одну фразу с разницей ровно в семь минут.':'На листе рукой Соколова: «Если собраны три записи — не жги мастер-ленту. Отправь копию и отключи контур вручную».'});updateJournal();refreshObjective();
  } else if(target.type==='generator'){
    if(world.fuses<3){target.active=true;toast(`НЕ ХВАТАЕТ ПРЕДОХРАНИТЕЛЕЙ · ${world.fuses}/3`);return;}
    world.generator=true;world.phase='gate';refreshObjective();generatorLamp.material.color.setHex(0x83ac83);generatorLamp.material.emissive=new THREE.Color(0x32683b);pointLight(0,1.4,-23.5,0x76a878,8,14);beep(180,.5,.06);setTimeout(()=>beep(360,.4,.04),280);toast('ГЕНЕРАТОР ЗАПУЩЕН · ОТКРЫТ СЕРВИСНЫЙ ШЛЮЗ',3500);
    $('radio-text').textContent='РАЦИЯ · КАНАЛ 4';subtitle('Соколов: «Теперь иди в архив. Там лента. Илья... не слушай, если она заплачет».',4600);world.monsterState=world.monsterAwake?'stalking':'dormant';
  } else if(target.type==='dial'){
    if(!world.tape){target.active=true;toast('НУЖНА МАСТЕР-ЛЕНТА · ПОСМОТРИ АРХИВ');return;}
    target.active=true;const i=target.index;world.dials[i]=(world.dials[i]+1)%10;dialMeshes[i].rotation.z=world.dials[i]*Math.PI/5;beep(430+world.dials[i]*36,.07,.012);refreshObjective();
    if(world.dials.join('')==='372'){
      world.signalTuned=true;world.phase='choice';signalLight.material.color.setHex(0x9ac08b);signalLight.material.emissive=new THREE.Color(0x386d40);refreshObjective();beep(720,.25,.04);setTimeout(()=>beep(930,.32,.035),240);subtitle('На всех линиях одновременно звучит один голос: «Илья, теперь решай».',4300);setTimeout(()=>{if(!world.ended)showChoices();},3600);
    }
  } else if(target.type==='exit'){
    if(!world.ending){target.active=true;toast('НЕТ ПИТАНИЯ · СНАЧАЛА ПРОЙДИ В НИЖНИЙ АРХИВ');return;}
    endGame(world.ending);return;
  }
  saveCheckpoint();
}

const keys={};
document.addEventListener('keydown',e=>{keys[e.code]=true;});document.addEventListener('keyup',e=>{keys[e.code]=false;});
function blocked(x,z){
  const r=player.radius;
  // Keep the player inside the complete station, tunnel, and archive level.
  if(x < -17.55||x>15.55||z>19.35||z< -56.45)return true;
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
  // Navigate the actual doorways between the hall, cable tunnel, and archive wings.
  if(targetZ<-28&&monster.position.z>-27){targetX=0;targetZ=-29.2;}
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
  const speed=world.phase==='escape'?1.28:world.tape?.9:world.generator?.58:.34;
  const pathDistance=Math.hypot(dx,dz);
  if(!lit&&pathDistance>.35){monster.position.x+=dx/pathDistance*speed*dt;monster.position.z+=dz/pathDistance*speed*dt;}
  monster.lookAt(investigating?world.noiseAt.x:player.x,1.2,investigating?world.noiseAt.z:player.z);
  monster.position.y=Math.sin(clock.elapsedTime*3)*.035;
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
  if(world.active&&world.flashlight&&world.battery>0){world.battery=Math.max(0,world.battery-dt*.00165);if(world.battery===0){toast('ФОНАРЬ ПОГАС · БАТАРЕЯ РАЗРЯЖЕНА',3500);world.flashlight=false;}updateFlashlight();}
  camera.position.set(player.x,(keys.ControlLeft||keys.ControlRight?1.1:player.y)+(world.moving?Math.sin(world.walked*8)*.025:0),player.z);
  camera.rotation.set(world.pitch,world.yaw,world.moving?Math.sin(world.walked*4)*.006:0,'YXZ');
  for(const item of interactables){if(item.type==='fuse'&&item.active){item.object.rotation.y+=dt*.35;item.object.position.y=.7+Math.sin(clock.elapsedTime*2+item.index)*.045;}}
  const target=currentTarget();if(target&&world.active&&!letterOpen){$('prompt-text').textContent=target.label;$('prompt').classList.remove('hidden');}else $('prompt').classList.add('hidden');
  updateMonster(dt);flickerLights();renderer.render(scene,camera);
}
animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setSize(innerWidth,innerHeight);});
