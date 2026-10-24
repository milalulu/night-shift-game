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

scene.add(new THREE.HemisphereLight(0x9ba8a3, 0x171a17, 0.38));
const ambient = new THREE.AmbientLight(0x84909a, 0.2); scene.add(ambient);

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
const world = { active: false, paused: false, ended: false, fuses: 0, generator: false, monsterAwake: false, monsterCaught: false, flashlight: true, yaw: 0, pitch: 0, moving: false, stamina: 1, walked: 0 };
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
  bulb.position.set(x,3.02,z);scene.add(bulb);pointLight(x,2.95,z,color,strength*9,8.5,2.0);
}
function sign(text, x, y, z, width = 2.1) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const c = canvas.getContext('2d'); c.fillStyle = '#26302e';c.fillRect(0,0,512,128);c.strokeStyle='#93644a';c.lineWidth=5;c.strokeRect(5,5,502,118);
  c.fillStyle='#c7b99a';c.font='bold 35px monospace';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,65);
  const tex = new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width,.58),new THREE.MeshBasicMaterial({map:tex}));mesh.position.set(x,y,z);scene.add(mesh);return mesh;
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
wallZ(-28,-4,4,mats.wallDark);wallX(-4,-28,-20,mats.wallDark);wallX(4,-28,-20,mats.wallDark);
wallZ(20,-16,-1.5,mats.wallDark);wallZ(20,1.5,16,mats.wallDark);
// Red emergency exit frame.
box('exit frame',-1.45,1.65,20, .22,3.3,.34,mats.rust);box('exit frame',1.45,1.65,20,.22,3.3,.34,mats.rust);box('exit lintel',0,3.15,20,3.1,.3,.34,mats.rust);
const exitDoor=box('exit door',0,1.55,20,2.75,3,.28,mats.darkMetal,{collider:true});
sign('ВЫХОД  /  EXIT',0,2.37,19.77,2.25);

// Details: flickering lights, wiring, stained paint, lockers, desk clutter.
fixture(0,-17,0xc7b78e,.55);fixture(0,-8,0x9aafad,.72);fixture(0,0,0xc8b991,.58);fixture(0,8,0x9b4030,.4);fixture(0,16,0xc3b995,.62);
fixture(-10,-8,0xc6b58c,.43);fixture(10,-8,0x9eafb0,.48);fixture(-10,8,0x9c4935,.38);fixture(10,8,0xc7b68c,.42);
sign('РЕЛЕЙНЫЙ ЗАЛ',0,2.66,-6.2,2.8);sign('АРХИВ',10,2.55,-12.76,1.45);sign('МАСТЕРСКАЯ',-10,2.55,12.76,2.1);sign('ЩИТОВАЯ',0,2.65,-25.78,1.7);
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
const generatorLamp=new THREE.Mesh(new THREE.SphereGeometry(.09,10,8),new THREE.MeshBasicMaterial({color:0x872f22}));generatorLamp.position.set(0,1.35,-23.78);scene.add(generatorLamp);
box('exhaust pipe',1.32,2.6,-25,.22,.85,.22,mats.rust);
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

const noteObject=box('note',-9.2,.96,8.25,.52,.04,.34,mats.paper);noteObject.rotation.y=.2;
interactables.push({type:'note',object:noteObject,x:-9.2,z:8.25,active:true,label:'Прочитать записку'});
interactables.push({type:'generator',object:generatorPrompt,x:0,z:-23.1,active:true,label:'Запустить генератор'});
interactables.push({type:'exit',object:exitDoor,x:0,z:19.3,active:true,label:'Открыть дверь'});

// Handheld flashlight, attached to the view so it follows mouse-look exactly.
const flashlight=new THREE.SpotLight(0xd8d5bd,0,19,Math.PI/8,0.48,1.35);
flashlight.position.set(0,0,0);flashlight.target.position.set(0,0,-1);camera.add(flashlight);camera.add(flashlight.target);scene.add(camera);
const flashlightFill=new THREE.PointLight(0xc9d2d3,0,2.4,2);flashlightFill.position.set(.12,-.2,-.35);camera.add(flashlightFill);

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
  const ctx=new Ctx();window.audioContext=ctx;
  const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
  osc.type='sawtooth';osc.frequency.value=49;filter.type='lowpass';filter.frequency.value=115;gain.gain.value=.018;
  osc.connect(filter).connect(gain).connect(ctx.destination);osc.start();
  const osc2=ctx.createOscillator(),g2=ctx.createGain();osc2.type='sine';osc2.frequency.value=52.3;g2.gain.value=.009;osc2.connect(g2).connect(ctx.destination);osc2.start();
}
function beep(freq=680,duration=.12,volume=.035){
  const ctx=window.audioContext;if(!ctx)return;const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(freq,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.72,ctx.currentTime+duration);g.gain.setValueAtTime(volume,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);o.connect(g).connect(ctx.destination);o.start();o.stop(ctx.currentTime+duration);
}
function subtitle(text,duration=3200){const el=$('subtitle');el.textContent=text;el.classList.remove('hidden');clearTimeout(subtitle.timer);subtitle.timer=setTimeout(()=>el.classList.add('hidden'),duration);}
function toast(text,duration=2300){const el=$('toast');el.textContent=text;el.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),duration);}
function refreshObjective(){
  $('fuse-count').textContent=`${world.fuses} / 3`;
  if(world.fuses<3){$('objective-text').childNodes[0].textContent='Найти предохранители ';}
  else if(!world.generator){$('objective-text').childNodes[0].textContent='Запустить генератор ';$('fuse-count').textContent='ГОТОВО';}
  else{$('objective-text').childNodes[0].textContent='Добраться до выхода ';$('fuse-count').textContent='ДВЕРЬ ОТКРЫТА';}
}
function begin(){
  $('overlay').classList.add('hidden');$('hud').classList.remove('hidden');world.active=true;world.paused=false;audioStart();renderer.domElement.requestPointerLock?.();
  subtitle('Смена началась. Рация молчит. Найди три предохранителя.',4200);
}
function pause(){if(!world.active||world.ended)return;world.paused=true;world.active=false;$('overlay').innerHTML='<div class="menu-card"><div class="eyebrow"><span class="eyebrow-line"></span> СМЕНА ПРИОСТАНОВЛЕНА</div><h1 style="font-size:clamp(64px,10vw,110px)">ТИШЕ.</h1><p class="story">Станция никуда не денется. Надеюсь.</p><button id="resume-button" class="start-button"><span>ВЕРНУТЬСЯ</span><b>↗</b></button><div class="menu-footer"><span>Нажми ESC, чтобы продолжить</span></div></div>';$('overlay').classList.remove('hidden');document.exitPointerLock?.();$('resume-button').onclick=resume;}
function resume(){world.paused=false;world.active=true;$('overlay').classList.add('hidden');renderer.domElement.requestPointerLock?.();}
function endGame(win){
  world.ended=true;world.active=false;document.exitPointerLock?.();
  $('hud').classList.add('hidden');
  $('overlay').innerHTML=`<div class="menu-card"><div class="eyebrow"><span class="eyebrow-line"></span> ${win?'ДЕЛО ЗАКРЫТО':'СИГНАЛ ПОТЕРЯН'}</div><h1 style="font-size:clamp(64px,10vw,110px)">${win?'РАССВЕТ':'НЕ ОДИН'}</h1><p class="story">${win?'Ты выбрался до рассвета. В журнале смены на следующую ночь появилась новая запись: «Не включай линию 4».':'Фонарь погас. В журнале смены утром нашли только одну фразу: «Оно не любит свет». Попробуй ещё раз.'}</p><button id="restart-button" class="start-button"><span>НАЧАТЬ СНАЧАЛА</span><b>↗</b></button><div class="build-stamp">СМЕНА 13 <span>·</span> КОНЕЦ ЗАПИСИ</div></div>`;
  $('overlay').classList.remove('hidden');$('restart-button').onclick=()=>location.reload();
}
$('start-button').addEventListener('click',begin);
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==renderer.domElement&&world.active&&!world.ended)pause();});
document.addEventListener('mousemove',(e)=>{if(!world.active||document.pointerLockElement!==renderer.domElement)return;world.yaw-=e.movementX*.0021;world.pitch-=e.movementY*.0018;world.pitch=THREE.MathUtils.clamp(world.pitch,-1.3,1.3);});
document.addEventListener('keydown',(e)=>{
  if(e.code==='Escape'){if(world.active)pause();else if(world.paused)resume();return;}
  if(!world.active)return;
  if(e.code==='KeyF'){world.flashlight=!world.flashlight;updateFlashlight();beep(world.flashlight?580:260,.08,.018);}
  if(e.code==='KeyE')interact();
});
function updateFlashlight(){flashlight.intensity=world.flashlight?22:0;flashlightFill.intensity=world.flashlight?1.1:0;$('light-state').textContent=world.flashlight?'ВКЛ':'ВЫКЛ';$('light-state').style.color=world.flashlight?'#c5ae7c':'#a6503c';}
updateFlashlight();

function distance(x,z,a=player.x,b=player.z){return Math.hypot(x-a,z-b);}
function currentTarget(){
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
  target.active=false;
  if(target.type==='fuse'){
    target.object.visible=false;world.fuses++;refreshObjective();beep(760,.17,.04);toast('ПРЕДОХРАНИТЕЛЬ ДОБАВЛЕН · '+world.fuses+'/3');
    if(world.fuses===1){world.monsterAwake=true;monster.visible=true;monster.position.set(0,0,-16.7);subtitle('Рация (шёпотом): «...ты тоже слышал?»',3800);$('radio-text').textContent='РАЦИЯ · ВХОДЯЩИЙ СИГНАЛ';}
    if(world.fuses===2)subtitle('В дальнем конце коридора что-то скребёт по полу.',3300);
    if(world.fuses===3){subtitle('Все три. Щитовая — в конце коридора.',4000);$('radio-text').textContent='РАЦИЯ · НЕИЗВЕСТНЫЙ КАНАЛ';}
  } else if(target.type==='note'){
    letterOpen=true;const note=$('letter');note.textContent='17 октября 1998\n\nЕсли опять услышишь голос дежурного из отключённой линии — не отвечай. Линия четыре снята с коммутатора ещё в августе.\n\nЯ оставил запасные предохранители в архиве и мастерской. Ключ от выхода у диспетчера.\n\nТолько не смотри в конец коридора, когда гаснет лампа.';note.classList.remove('hidden');beep(390,.1,.018);
  } else if(target.type==='generator'){
    if(world.fuses<3){target.active=true;toast('НЕ ХВАТАЕТ ПРЕДОХРАНИТЕЛЕЙ · '+world.fuses+'/3');return;}
    world.generator=true;refreshObjective();generatorLamp.material.color.setHex(0x83ac83);generatorLamp.material.emissive=new THREE.Color(0x32683b);pointLight(0,1.4,-23.5,0x76a878,1.1,9);beep(180,.5,.06);setTimeout(()=>beep(360,.4,.04),280);toast('ГЕНЕРАТОР ЗАПУЩЕН · ВЫХОД ОТКРЫТ',3500);
    exitDoor.visible=false;const doorCollider=colliders.findIndex(c=>Math.abs(c.x)<.01&&Math.abs(c.z-20)<.01&&c.hx<2);if(doorCollider>=0)colliders.splice(doorCollider,1);
    world.monsterAwake=true;monster.visible=true;monster.position.set(0,0,-17);$('radio-text').textContent='РАЦИЯ · НЕИЗВЕСТНЫЙ КАНАЛ';subtitle('Свет вернулся. Но не во всём здании.',3500);
    if(!world.monsterCaught)world.monsterCaught=true;
  } else if(target.type==='exit'){
    if(!world.generator){target.active=true;toast('ЗАМОК НЕ ОТПУСКАЕТ · НУЖНО ПИТАНИЕ');return;}
    endGame(true);
  }
}
let letterOpen=false;

const keys={};
document.addEventListener('keydown',e=>{keys[e.code]=true;});document.addEventListener('keyup',e=>{keys[e.code]=false;});
function blocked(x,z){
  const r=player.radius;
  // Keep the player inside the station's walkable footprint.
  if(x < -15.55||x>15.55||z>19.35||z< -27.4)return true;
  for(const c of colliders){if(Math.abs(x-c.x)<c.hx+r&&Math.abs(z-c.z)<c.hz+r)return true;}
  return false;
}
function movement(dt){
  if(!world.active||letterOpen)return;
  let forward=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0);
  let side=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
  const len=Math.hypot(forward,side);if(!len){world.moving=false;world.stamina=Math.min(1,world.stamina+dt*.19);$('stamina-fill').style.width=`${Math.round(world.stamina*100)}%`;return;}
  forward/=len;side/=len;const sprint=keys.ShiftLeft||keys.ShiftRight;const speed=sprint&&world.stamina>.03?4.7:2.6;
  if(sprint)world.stamina=Math.max(0,world.stamina-dt*.28);else world.stamina=Math.min(1,world.stamina+dt*.17);
  $('stamina-fill').style.width=`${Math.round(world.stamina*100)}%`;
  const dx=(-Math.sin(world.yaw)*forward+Math.cos(world.yaw)*side)*speed*dt;
  const dz=(-Math.cos(world.yaw)*forward-Math.sin(world.yaw)*side)*speed*dt;
  if(!blocked(player.x+dx,player.z))player.x+=dx;
  if(!blocked(player.x,player.z+dz))player.z+=dz;
  world.moving=true;world.walked+=dt*speed;
}
function updateMonster(dt){
  if(!world.monsterAwake||world.ended)return;
  const d=distance(monster.position.x,monster.position.z);
  let targetX=player.x,targetZ=player.z;
  // Keep it in the corridor until it reaches the doorway to the room you're in.
  if(Math.abs(player.x)>4.4){
    const doorwayZ=player.z<0?-8:8;
    targetX=0;targetZ=doorwayZ;
    if(Math.abs(monster.position.z-doorwayZ)<1.1)targetX=Math.sign(player.x)*4.45;
    if(Math.abs(monster.position.x-Math.sign(player.x)*4.45)<.7&&Math.abs(monster.position.z-doorwayZ)<1.1){targetX=player.x;targetZ=player.z;}
  }
  const dx=targetX-monster.position.x,dz=targetZ-monster.position.z;
  const toMonster=new THREE.Vector3(player.x-monster.position.x,0,player.z-monster.position.z).normalize();
  const look=new THREE.Vector3(-Math.sin(world.yaw),0,-Math.cos(world.yaw));
  const facing=look.dot(toMonster)>.62;
  const lit=facing&&world.flashlight&&d<14;
  if(lit){monsterMat.emissive.setHex(0x20110c);}
  const speed=world.generator?.95:.52;
  const pathDistance=Math.hypot(dx,dz);
  if(!lit&&pathDistance>.35){monster.position.x+=dx/pathDistance*speed*dt;monster.position.z+=dz/pathDistance*speed*dt;}
  monster.lookAt(player.x,1.2,player.z);
  monster.position.y=Math.sin(clock.elapsedTime*3)*.035;
  if(d<1.15){endGame(false);}
  if(world.fuses===1&&d<9&&Math.random()<dt*.16){beep(110,.28,.026);}
}
function flickerLights(){
  const t=clock.elapsedTime;
  scene.traverse(o=>{if(o.isPointLight&&o.position.y>2.8&&o.position.y<3.1){const seed=Math.floor((o.position.x+20)*7+o.position.z*3);o.intensity=(Math.sin(t*2.2+seed)*.5+.5)>.985?0.12:(o.userData.base??(o.userData.base=o.intensity));}});
}
function animate(){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.045);
  movement(dt);
  camera.position.set(player.x,player.y+(world.moving?Math.sin(world.walked*8)*.025:0),player.z);
  camera.rotation.set(world.pitch,world.yaw,world.moving?Math.sin(world.walked*4)*.006:0,'YXZ');
  for(const item of interactables){if(item.type==='fuse'&&item.active){item.object.rotation.y+=dt*.35;item.object.position.y=.7+Math.sin(clock.elapsedTime*2+item.index)*.045;}}
  const target=currentTarget();if(target&&world.active&&!letterOpen){$('prompt-text').textContent=target.label;$('prompt').classList.remove('hidden');}else $('prompt').classList.add('hidden');
  updateMonster(dt);flickerLights();renderer.render(scene,camera);
}
animate();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setSize(innerWidth,innerHeight);});
