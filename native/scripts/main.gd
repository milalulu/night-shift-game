extends Node3D

const PlayerController = preload("res://scripts/player_controller.gd")
const SAVE_PATH_E1 := "user://shift13_episode1.cfg"
const SAVE_PATH_E2 := "user://shift13_episode2.cfg"
const SAVE_PATH_LEGACY := "user://shift13_native.cfg"
const PROFILE_PATH := "user://shift13_profile.cfg"

var player
var world_environment: WorldEnvironment
var hud_layer: CanvasLayer
var hud: Control
var menu: Control
var document_panel: PanelContainer
var choice_panel: PanelContainer
var title_story: Label
var objective_label: Label
var progress_label: Label
var prompt_label: Label
var subtitle_label: Label
var clock_label: Label
var stamina_bar: ProgressBar
var battery_bar: ProgressBar
var message_label: Label
var meters_label: Label
var document_title_label: Label
var document_body_label: Label
var radio_player: AudioStreamPlayer
var journal_entries: Array[Dictionary] = []
var evidence_ids: Dictionary = {}
var fuse_ids: Dictionary = {}
var dials := [0, 0, 0]
var fuses_found := 0
var phase := "fuses"
var current_episode := 1
var generator_on := false
var service_gate_open := false
var tape_found := false
var signal_tuned := false
var ending := ""
var episode2_unlocked := false
var previous_ending := ""
var episode2_record_ids: Dictionary = {}
var episode2_dials := [0,0,0]
var episode2_power := false
var episode2_gate_open := false
var episode2_ending := ""
var episode2_record_data: Dictionary = {}
var episode2_evidence: Dictionary = {}
var episode2_fuses_found := 0
var elapsed_seconds := 0.0
var monster: Node3D
var monster_active := false
var monster_speed := 0.36
var monster_body: MeshInstance3D
var monster_head: MeshInstance3D
var monster_eyes: Array[MeshInstance3D] = []
var monster_limb_pivots: Array[Node3D] = []
var service_door: StaticBody3D
var exit_door: StaticBody3D
var service_door_collision: CollisionShape3D
var exit_door_collision: CollisionShape3D
var generator_body: Node3D
var generator_rotor: Node3D
var generator_lamp: MeshInstance3D
var signal_lamp: MeshInstance3D
var radio_generator_body: Node3D
var radio_generator_lamp: MeshInstance3D
var radio_gate: StaticBody3D
var radio_gate_collision: CollisionShape3D
var radio_exit: StaticBody3D
var radio_exit_collision: CollisionShape3D
var radio_dials: Array[MeshInstance3D] = []
var radio_signal_lamp: MeshInstance3D
var emergency_light: OmniLight3D
var dial_nodes: Array[MeshInstance3D] = []
var interactables: Array[Area3D] = []
var subtitles_timer := 0.0
var message_timer := 0.0
var clock_timer := 0.0
var game_started := false
var has_checkpoint := false
var has_checkpoint_e1 := false
var has_checkpoint_e2 := false
var game_paused := false

func _active_save_path() -> String:
	return SAVE_PATH_E2 if current_episode == 2 else SAVE_PATH_E1

var choice_active := false
var reading_document := false
var hiding := false
var last_noise_position := Vector3.ZERO
var noise_level := 0.0
var player_was_running := false
var footsteps_timer := 0.0
var ambience_player: AudioStreamPlayer
var ambience_phase := 0.0
var save_timer := 0.0
var camera_shake := 0.0
var menu_layer: Control
var menu_panel: PanelContainer
var menu_content: VBoxContainer
var hud_root: Control
var document_root: PanelContainer
var choice_root: PanelContainer
var clock_seconds := 0.0
var show_controls := false

var mats: Dictionary = {}

func _ready() -> void:
	_build_materials()
	_build_environment()
	_build_station()
	_create_creature()
	_build_player()
	_build_audio()
	_build_ui()
	_load_checkpoint()
	_refresh_objective()
	_update_station_clock()
	_show_title()

func _build_materials() -> void:
	mats = {
		"wall": _material(Color("#343b38")),
		"wall_dark": _material(Color("#202624")),
		"floor": _material(Color("#34352f")),
		"concrete": _material(Color("#56574d")),
		"metal": _material(Color("#34403f"), Color.BLACK, .48),
		"dark_metal": _material(Color("#17201f"), Color.BLACK, .42),
		"rust": _material(Color("#744630"), Color.BLACK, .22),
		"wood": _material(Color("#4b3e2f")),
		"paper": _material(Color("#c5bda5")),
		"black": _material(Color("#070908")),
	}
	var wall_grain := _grain_texture(13)
	var floor_grain := _grain_texture(104)
	var wood_grain := _grain_texture(31)
	for key in ["wall","wall_dark","concrete"]:
		(mats[key] as StandardMaterial3D).albedo_texture = wall_grain
		(mats[key] as StandardMaterial3D).uv1_scale = Vector3(3.0,3.0,3.0)
	(mats.floor as StandardMaterial3D).albedo_texture = floor_grain
	(mats.floor as StandardMaterial3D).uv1_scale = Vector3(4.0,4.0,4.0)
	(mats.wood as StandardMaterial3D).albedo_texture = wood_grain
	(mats.wood as StandardMaterial3D).uv1_scale = Vector3(2.0,2.0,2.0)

func _grain_texture(seed: int) -> Texture2D:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var image := Image.create(96,96,false,Image.FORMAT_RGBA8)
	for y in range(96):
		for x in range(96):
			var value := rng.randf_range(.64,1.0)
			if rng.randf()<.018:
				value *= .52
			image.set_pixel(x,y,Color(value,value,value,1.0))
	return ImageTexture.create_from_image(image)

func _material(color: Color, emission: Color = Color.BLACK, metallic: float = 0.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.88
	material.metallic = metallic
	if emission != Color.BLACK:
		material.emission_enabled = true
		material.emission = emission
	return material

func _build_environment() -> void:
	world_environment = WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#080d10")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#9ba8a3")
	environment.ambient_light_energy = 0.42
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.fog_enabled = true
	environment.fog_light_color = Color("#11191b")
	environment.fog_density = 0.018
	world_environment.environment = environment
	add_child(world_environment)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-42, -24, 0)
	fill.light_color = Color("#87928e")
	fill.light_energy = 0.12
	add_child(fill)

func _solid_box(box_name: String, position: Vector3, size: Vector3, material: Material, solid: bool = true) -> Node3D:
	var body: Node3D
	if solid:
		var static_body := StaticBody3D.new()
		static_body.name = box_name
		var collision := CollisionShape3D.new()
		collision.name = "Hitbox"
		var shape := BoxShape3D.new()
		shape.size = size
		collision.shape = shape
		static_body.add_child(collision)
		body = static_body
	else:
		body = Node3D.new()
		body.name = box_name
	var mesh_instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_instance.mesh = mesh
	mesh_instance.material_override = material
	mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	body.add_child(mesh_instance)
	body.position = position
	add_child(body)
	return body

func _floor(center_x: float, center_z: float, width: float, depth: float) -> void:
	_solid_box("Concrete floor", Vector3(center_x, -0.11, center_z), Vector3(width, 0.22, depth), mats.floor)

func _wall_x(x: float, z1: float, z2: float, material: Material = null) -> void:
	_solid_box("Station wall", Vector3(x, 1.65, (z1 + z2) * .5), Vector3(.42, 3.3, z2-z1), material if material != null else mats.wall)

func _wall_z(z: float, x1: float, x2: float, material: Material = null) -> void:
	_solid_box("Station wall", Vector3((x1+x2)*.5, 1.65, z), Vector3(x2-x1, 3.3, .42), material if material != null else mats.wall)

func _lamp(x: float, z: float, color: Color, energy: float = 1.2) -> void:
	_solid_box("Lamp housing", Vector3(x, 3.12, z), Vector3(.82,.12,.3), mats.dark_metal, false)
	var bulb := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = Vector3(.48,.035,.14)
	bulb.mesh = mesh
	bulb.position = Vector3(x,3.035,z)
	var bulb_material := StandardMaterial3D.new()
	bulb_material.albedo_color = color
	bulb_material.emission_enabled = true
	bulb_material.emission = color
	bulb_material.emission_energy_multiplier = 1.5
	bulb.material_override = bulb_material
	add_child(bulb)
	var light := OmniLight3D.new()
	light.position = Vector3(x,2.9,z)
	light.light_color = color
	light.light_energy = energy
	light.omni_range = 8.5
	add_child(light)

func _sign(text: String, x: float, y: float, z: float, font_size: int = 24) -> void:
	var label := Label3D.new()
	label.text = text
	label.position = Vector3(x,y,z)
	label.font_size = font_size
	label.modulate = Color("#d1c3a1")
	label.outline_size = 7
	label.outline_modulate = Color("#151a19")
	label.pixel_size = .004
	add_child(label)

func _add_clock(position: Vector3) -> void:
	var housing := MeshInstance3D.new()
	var face_mesh := CylinderMesh.new()
	face_mesh.top_radius = .44
	face_mesh.bottom_radius = .44
	face_mesh.height = .12
	housing.mesh = face_mesh
	housing.rotation.x = PI/2.0
	housing.position = position
	housing.material_override = mats.dark_metal
	add_child(housing)
	var face := MeshInstance3D.new()
	var face_disc := CylinderMesh.new()
	face_disc.top_radius = .36
	face_disc.bottom_radius = .36
	face_disc.height = .025
	face.mesh = face_disc
	face.rotation.x = PI/2.0
	face.position = position + Vector3(0,0,.075)
	face.material_override = mats.paper
	add_child(face)
	var dial := Label3D.new()
	dial.text = "03:17"
	dial.position = position + Vector3(0,-.08,.095)
	dial.font_size = 24
	dial.pixel_size = .0035
	dial.modulate = Color("#743e2f")
	add_child(dial)

func _add_puddle(position: Vector3) -> void:
	var puddle := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = .58
	sphere.height = .035
	puddle.mesh = sphere
	puddle.position = position
	puddle.scale = Vector3(1.8,.38,.72)
	var water := StandardMaterial3D.new()
	water.albedo_color = Color(.12,.18,.18,.43)
	water.metallic = .3
	water.roughness = .16
	water.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	puddle.material_override = water
	puddle.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(puddle)

func _add_dust(center: Vector3, extents: Vector3, amount: int) -> void:
	var particles := GPUParticles3D.new()
	particles.position = center
	particles.amount = amount
	particles.lifetime = 7.0
	particles.preprocess = 3.0
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = extents
	process.direction = Vector3(0,1,0)
	process.spread = 180.0
	process.initial_velocity_min = .015
	process.initial_velocity_max = .09
	process.gravity = Vector3(0,.01,0)
	process.scale_min = .012
	process.scale_max = .035
	particles.process_material = process
	var dust := QuadMesh.new()
	dust.size = Vector2(.035,.035)
	var dust_material := StandardMaterial3D.new()
	dust_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dust_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dust_material.albedo_color = Color(.72,.72,.65,.22)
	dust.material = dust_material
	particles.draw_pass_1 = dust
	add_child(particles)

func _build_station() -> void:
	# Main relay hall and four rooms.
	_floor(0,0,8,40)
	_floor(-10,0,12,40)
	_floor(10,0,12,40)
	_floor(0,-24,8,8)
	for z in range(-18, 19, 4):
		_solid_box("Ceiling beam", Vector3(0,3.22,z), Vector3(8.7,.18,.22), mats.dark_metal, false)
		_solid_box("Floor seam", Vector3(0,.012,z), Vector3(7.7,.018,.035), mats.concrete, false)
		for side in [-1.0,1.0]:
			_solid_box("Painted wall panel",Vector3(side*3.76,1.38,z),Vector3(.045,1.12,2.5),mats.concrete,false)
			_solid_box("Rust wall brace",Vector3(side*3.71,.32,z),Vector3(.12,.18,2.65),mats.rust,false)
	for x in [-4.0,4.0]:
		_wall_x(x,-20,-10.1)
		_wall_x(x,-5.9,5.9)
		_wall_x(x,10.1,20)
	for x in [-16.0,16.0]:
		_wall_x(x,-20,20,mats.wall_dark)
	for z in [-13.0,-3.0,3.0,13.0]:
		_wall_z(z,-16,-4,mats.wall_dark)
		_wall_z(z,4,16,mats.wall_dark)
	_wall_z(-20,-16,-4,mats.wall_dark)
	_wall_z(-20,4,16,mats.wall_dark)
	_wall_z(-28,-4,-1.28,mats.wall_dark)
	_wall_z(-28,1.28,4,mats.wall_dark)
	_wall_z(20,-16,-1.5,mats.wall_dark)
	_wall_z(20,1.5,16,mats.wall_dark)
	for z in [-17.0,-8.0,0.0,8.0,16.0]:
		_lamp(0,z,Color("#c4b68f"),1.1)
	_lamp(-10,-8,Color("#c2b38e"),.8)
	_lamp(10,-8,Color("#9eafb0"),.8)
	_lamp(-10,8,Color("#a8503a"),.65)
	_lamp(10,8,Color("#c1b18b"),.7)
	_sign("РЕЛЕЙНЫЙ ЗАЛ",0,2.6,-6,22)
	_sign("АРХИВ",10,2.45,-12.7,18)
	_sign("МАСТЕРСКАЯ",-10,2.45,12.7,18)
	_sign("ЩИТОВАЯ",0,2.5,-25.8,18)
	for x in [-3.45,3.45]:
		var pipe := _solid_box("Copper pipe",Vector3(x,2.92,0),Vector3(.14,.14,38),mats.rust,false)
	# Cable tunnel, signal chamber and side archives.
	_floor(0,-35.5,8,15)
	_floor(0,-50,16,14)
	_floor(-13,-50,10,14)
	_floor(12,-50,8,14)
	for x in [-4.0,4.0]:
		_wall_x(x,-43,-28,mats.wall_dark)
	_wall_z(-43,-16,-4,mats.wall_dark)
	_wall_z(-43,4,16,mats.wall_dark)
	_wall_x(-8,-57,-52.2,mats.wall_dark)
	_wall_x(-8,-47.8,-43,mats.wall_dark)
	_wall_x(-18,-57,-43,mats.wall_dark)
	_wall_z(-57,-18,-8,mats.wall_dark)
	_wall_z(-43,-18,-8,mats.wall_dark)
	_wall_x(8,-57,-52.2,mats.wall_dark)
	_wall_x(8,-47.8,-43,mats.wall_dark)
	_wall_x(16,-57,-43,mats.wall_dark)
	_wall_z(-57,8,16,mats.wall_dark)
	_wall_z(-43,8,16,mats.wall_dark)
	_wall_z(-57,-8,8,mats.wall_dark)
	for z in [-31.0,-37.0,-42.0]:
		_solid_box("Tunnel crossbeam",Vector3(0,3.15,z),Vector3(8.5,.16,.22),mats.rust,false)
		_lamp(0,z,Color("#bda983"),.65)
	_lamp(-13,-50,Color("#9d4b38"),.6)
	_lamp(12,-50,Color("#9aabad"),.6)
	_sign("КАБЕЛЬНЫЙ ТОННЕЛЬ",0,2.45,-34.5,18)
	_sign("АРХИВ ЛЕНТ",-13,2.45,-43.7,17)
	_sign("КОММУТАТОР",0,2.35,-44,18)
	_add_clock(Vector3(0,2.45,-6.35))
	for puddle in [Vector3(-2.2,.012,-4.4),Vector3(1.9,.012,5.2),Vector3(-1.3,.012,-35.8),Vector3(2.1,.012,-46.0)]:
		_add_puddle(puddle)
	_add_dust(Vector3(0,1.8,-36),Vector3(3.1,2.1,9),44)
	# Tables and shelving provide readable silhouettes and cover.
	_table(-10,-8,2.3,1.15)
	_shelf(13,-8)
	_shelf(7,-8,PI)
	_table(-10,8,2.0,1.0)
	_table(10,-8,1.8,1.0)
	_table(-13,-50,2.4,1.25)
	_shelf(-16,-50,PI/2)
	_shelf(-10,-50,PI/2)
	_table(12,-50,2.3,1.1)
	# Generator and old commutator.
	generator_body = _solid_box("Emergency generator",Vector3(0,1.35,-25),Vector3(3.1,1.65,2),mats.metal)
	_solid_box("Generator base",Vector3(0,.28,-25),Vector3(3.5,.55,2.4),mats.dark_metal)
	generator_lamp = _make_glow(Vector3(0,1.42,-23.82),Color("#863a2d"),.5)
	service_door = _solid_box("Service gate",Vector3(0,1.58,-28),Vector3(2.45,3.05,.28),mats.dark_metal)
	service_door_collision = service_door.get_node("Hitbox")
	# Transmitter face and three frequency knobs.
	_solid_box("Old commutator",Vector3(12,1.55,-53.35),Vector3(3.2,2.7,.5),mats.dark_metal)
	for row in range(3):
		for col in range(7):
			var light_mesh := MeshInstance3D.new()
			var box_mesh := BoxMesh.new()
			box_mesh.size = Vector3(.12,.12,.035)
			light_mesh.mesh = box_mesh
			light_mesh.position = Vector3(10.85+col*.38,2.35-row*.48,-53.06)
			light_mesh.material_override = _material(Color("#607263") if (row+col)%4!=0 else Color("#9e4932"),Color("#34231a"))
			add_child(light_mesh)
	_solid_box("Signal console",Vector3(0,1.12,-53.05),Vector3(3.5,.42,.8),mats.metal)
	_solid_box("Signal display",Vector3(0,1.75,-53.15),Vector3(2.3,.78,.08),_material(Color("#253d39"),Color("#10251e")),false)
	for index in range(3):
		var dial := MeshInstance3D.new()
		var cylinder := CylinderMesh.new()
		cylinder.top_radius = .23
		cylinder.bottom_radius = .23
		cylinder.height = .12
		dial.mesh = cylinder
		dial.position = Vector3(-.85+index*.85,1.18,-52.55)
		dial.material_override = mats.rust
		add_child(dial)
		dial_nodes.append(dial)
		_add_interactable("dial", str(index), "Настроить канал %d" % (index+1), Vector3(-.85+index*.85,1.18,-52.55), Color("#a07852"), "dial")
	_create_exit()
	_create_interactables()
	_build_radio_center()

func _build_radio_center() -> void:
	# Episode II lives far enough from the first station to share one native scene safely.
	_floor(100,0,8,40)
	_floor(90,0,12,40)
	_floor(110,0,12,40)
	_floor(100,25,40,10)
	_floor(100,-26,16,12)
	_floor(100,-40,16,16)
	for x in [96.0,104.0]:
		_wall_x(x,-20,-10.1,mats.wall_dark)
		_wall_x(x,-5.9,5.9,mats.wall_dark)
		_wall_x(x,10.1,20,mats.wall_dark)
	for x in [84.0,116.0]:
		_wall_x(x,-20,20,mats.wall_dark)
	for z in [-13.0,-3.0,3.0,13.0]:
		_wall_z(z,84,96,mats.wall_dark)
		_wall_z(z,104,116,mats.wall_dark)
	_wall_z(-20,84,96,mats.wall_dark)
	_wall_z(-20,104,116,mats.wall_dark)
	_wall_z(20,84,98.5,mats.wall_dark)
	_wall_z(20,101.5,116,mats.wall_dark)
	_wall_x(92,-32,-20,mats.wall_dark)
	_wall_x(108,-32,-20,mats.wall_dark)
	_wall_z(-32,92,98.7,mats.wall_dark)
	_wall_z(-32,101.3,108,mats.wall_dark)
	radio_gate = _solid_box("Radio center north gate",Vector3(100,1.58,-32),Vector3(2.45,3.05,.28),mats.dark_metal)
	radio_gate_collision = radio_gate.get_node("Hitbox")
	_wall_x(92,-48,-32,mats.wall_dark)
	_wall_x(108,-48,-32,mats.wall_dark)
	_wall_z(-48,92,108,mats.wall_dark)
	for z in [-16.0,-8.0,0.0,8.0,16.0]:
		_solid_box("Broadcast ceiling beam",Vector3(100,3.22,z),Vector3(8.7,.18,.22),mats.rust,false)
		_lamp(100,z,Color("#b6ac91") if z != 0 else Color("#a33d31"),.85 if z != 0 else .4)
	_lamp(90,-8,Color("#bcae89"),.7)
	_lamp(110,-8,Color("#9aabb0"),.7)
	_lamp(90,8,Color("#a34b36"),.55)
	_lamp(110,8,Color("#b7ab8d"),.65)
	_lamp(100,-26,Color("#a8a184"),.7)
	_lamp(100,-40,Color("#a2aeb0"),.7)
	_sign("РАЙОННЫЙ РАДИОЦЕНТР",100,2.55,17.7,30)
	_sign("МОНТАЖНАЯ",90,2.45,-12.75,17)
	_sign("АРХИВ ЭФИРА",110,2.45,-12.75,18)
	_sign("ЭФИРНАЯ",90,2.45,12.75,16)
	_sign("ЩИТОВАЯ",100,2.45,-29.5,16)
	_sign("ПЕРЕДАТЧИК",100,2.45,-44,18)
	# Rooftop antenna and old acoustic treatment make the second location distinct.
	_floor(100,29,40,18)
	_wall_x(80,20,38,mats.wall_dark)
	_wall_x(120,20,38,mats.wall_dark)
	_wall_z(38,80,120,mats.wall_dark)
	_solid_box("Broadcast mast",Vector3(100,5.2,27),Vector3(.22,10.4,.22),mats.metal,false)
	for y in [2.8,5.2,7.6]:
		_solid_box("Mast crossbar",Vector3(100,y,27),Vector3(3.3,.12,.12),mats.rust,false)
	_solid_box("Antenna shadow",Vector3(100,3.22,-8),Vector3(8.6,.1,.22),mats.dark_metal,false)
	_add_dust(Vector3(100,1.8,-8),Vector3(3.1,2.1,9),36)
	_table(90,-8,2.2,1.15)
	_table(110,-8,2.2,1.1)
	_table(90,8,2.2,1.05)
	_table(105,-26,1.8,.9)
	_solid_box("E2 tape deck",Vector3(90,1.04,-8),Vector3(1.25,.35,.55),mats.dark_metal,false)
	_solid_box("E2 archive recorder",Vector3(110,1.0,-8),Vector3(1.0,.3,.5),mats.dark_metal,false)
	_solid_box("E2 microphone",Vector3(90,1.35,8),Vector3(.12,.72,.12),mats.metal,false)
	var radio_frame := _solid_box("E2 generator base",Vector3(100,.28,-27),Vector3(3.7,.55,2.4),mats.dark_metal)
	radio_generator_body = _solid_box("E2 backup generator",Vector3(100,1.35,-27),Vector3(3.2,1.65,2),mats.metal)
	radio_generator_lamp = _make_glow(Vector3(100,1.42,-25.93),Color("#873b2d"),.55)
	var e2_panel := _add_interactable("episode2_generator","backup-gen","Подать питание на передатчик",Vector3(100,1.35,-25.55),Color("#bf7952"),"panel")
	radio_signal_lamp = _make_glow(Vector3(101.45,1.65,-45.05),Color("#903b2a"),.55)
	_solid_box("E2 transmitter console",Vector3(100,1.12,-45.1),Vector3(3.7,.42,.8),mats.metal)
	_solid_box("E2 transmitter display",Vector3(100,1.75,-45.2),Vector3(2.5,.76,.08),_material(Color("#293b35"),Color("#10251e")),false)
	for index in range(3):
		var dial := MeshInstance3D.new()
		var cylinder := CylinderMesh.new()
		cylinder.top_radius = .23
		cylinder.bottom_radius = .23
		cylinder.height = .12
		dial.mesh = cylinder
		dial.position = Vector3(99.15+index*.85,1.18,-44.61)
		dial.material_override = mats.rust
		add_child(dial)
		radio_dials.append(dial)
		_add_interactable("episode2_dial",str(index),"Настроить полосу %d" % (index+1),dial.position,Color("#a07852"),"dial")
	radio_exit = _solid_box("E2 south exit",Vector3(100,1.55,20),Vector3(2.75,3,.28),mats.dark_metal)
	radio_exit_collision = radio_exit.get_node("Hitbox")
	_add_interactable("episode2_exit","e2-exit","Покинуть радиоцентр",Vector3(100,1.45,18.8),Color("#b84935"),"door")
	var e2_exit_frame := _mesh_box("E2 exit frame",Vector3(100,2.9,20),Vector3(3.1,.25,.35),mats.rust)
	add_child(e2_exit_frame)
	var record_data := {
		"e2-operator-log":{"title":"Катушка №1 · Голос","text":"24 октября, 02:10. Передатчик выключен, но в эфире идёт моя смена. Я слышу, как сама читаю этот журнал. Карточка частот лежит в архиве."},
		"e2-frequency-card":{"title":"Катушка №2 · Частоты","text":"Маршрут резервного сигнала: нижняя полоса — 5, средняя — 1, верхняя — 9. Не подавай несущую, пока не найдёшь все три катушки."},
		"e2-studio-transcript":{"title":"Катушка №3 · Задержка","text":"Голос в эфире повторяет слова дежурного с задержкой в семь минут. Сигнал не предсказывает. Он вспоминает."},
		"e2-repair-note":{"title":"Ремонтная бирка","text":"Передатчик можно изолировать от городской сети через ручной байпас. Дополнительные улики нужны, чтобы сохранить копию эфира и замкнуть контур."},
	}
	episode2_record_data = record_data
	for entry in [
		["e2-operator-log",Vector3(90,1.15,-8)],
		["e2-frequency-card",Vector3(110,1.15,-8)],
		["e2-studio-transcript",Vector3(90,1.15,8)],
	]:
		var id: String = entry[0]
		_add_interactable("episode2_record",id,"Прослушать: %s" % record_data[id].title,entry[1],Color("#c6b58f"),"reel")
	_add_interactable("episode2_repair","e2-repair-note","Забрать ремонтную бирку",Vector3(104.7,1.15,-25.6),Color("#c6b58f"),"paper")
	_add_interactable("episode2_gate","e2-gate","Открыть северный шлюз",Vector3(100,1.5,-31.1),Color("#bf7952"),"panel")
	_add_interactable("episode2_hide","e2-hide-studio","Спрятаться за шкафом",Vector3(93.9,1.2,8),Color("#524238"),"hide")
	_add_interactable("episode2_hide","e2-hide-archive","Спрятаться в архивном шкафу",Vector3(112.2,1.2,8),Color("#524238"),"hide")
	_add_interactable("episode2_battery","e2-battery","Забрать элемент питания",Vector3(112,.95,7),Color("#a69a68"),"battery")

func _table(x: float, z: float, width: float, depth: float) -> void:
	_solid_box("Table top",Vector3(x,.82,z),Vector3(width,.12,depth),mats.wood,false)
	for dx in [-width*.42,width*.42]:
		for dz in [-depth*.38,depth*.38]:
			_solid_box("Table leg",Vector3(x+dx,.4,z+dz),Vector3(.09,.8,.09),mats.dark_metal,false)

func _shelf(x: float, z: float, rotation: float = 0.0) -> void:
	var root := Node3D.new()
	root.position = Vector3(x,0,z)
	root.rotation.y = rotation
	add_child(root)
	for dx in [-.83,.83]:
		var post := _mesh_box("Shelf post",Vector3(dx,1.1,0),Vector3(.1,2.2,.1),mats.rust)
		root.add_child(post)
	for y in [.25,.95,1.65,2.15]:
		var shelf := _mesh_box("Shelf",Vector3(0,y,0),Vector3(1.8,.1,.58),mats.dark_metal)
		root.add_child(shelf)

func _mesh_box(mesh_name: String, position: Vector3, size: Vector3, material: Material) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.name = mesh_name
	var mesh := BoxMesh.new()
	mesh.size = size
	instance.mesh = mesh
	instance.material_override = material
	return instance

func _make_glow(position: Vector3, color: Color, energy: float) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = .09
	sphere.height = .18
	mesh.mesh = sphere
	mesh.position = position
	mesh.material_override = _material(color,color*0.35)
	add_child(mesh)
	var light := OmniLight3D.new()
	light.position = position
	light.light_color = color
	light.light_energy = energy
	light.omni_range = 4.0
	add_child(light)
	return mesh

func _create_exit() -> void:
	_wall_z(20,-16,-1.5,mats.wall_dark)
	_wall_z(20,1.5,16,mats.wall_dark)
	_solid_box("Exit frame",Vector3(-1.45,1.65,20),Vector3(.22,3.3,.34),mats.rust,false)
	_solid_box("Exit frame",Vector3(1.45,1.65,20),Vector3(.22,3.3,.34),mats.rust,false)
	exit_door = _solid_box("Exit door",Vector3(0,1.55,20),Vector3(2.75,3,.28),mats.dark_metal)
	exit_door_collision = exit_door.get_node("Hitbox")
	_add_interactable("exit", "south-exit", "Открыть выход", Vector3(0,1.45,18.8), Color("#b84935"), "door")
	_sign("ВЫХОД / EXIT",0,2.35,19.76,18)

func _create_interactables() -> void:
	_add_interactable("fuse", "1", "Поднять предохранитель", Vector3(-10,1.15,-8), Color("#d09359"), "fuse")
	_add_interactable("fuse", "2", "Поднять предохранитель", Vector3(10,1.15,-8), Color("#d09359"), "fuse")
	_add_interactable("fuse", "3", "Поднять предохранитель", Vector3(-10,1.15,8), Color("#d09359"), "fuse")
	_add_interactable("record", "shift-log", "Прочитать журнал смены", Vector3(-9.2,1.1,8.25), Color("#c8bea4"), "paper")
	_add_interactable("record", "relay-report", "Прочитать акт релейной бригады", Vector3(10,1.1,-8), Color("#c8bea4"), "paper")
	_add_interactable("record", "workshop-note", "Прочитать записку на схеме", Vector3(-10,1.1,-8), Color("#c8bea4"), "paper")
	_add_interactable("record", "tunnel-tag", "Прочитать бирку кабеля", Vector3(2.8,1.1,-38), Color("#c8bea4"), "paper")
	_add_interactable("battery", "cell-west", "Забрать элемент питания", Vector3(11.5,.9,7.3), Color("#a69a68"), "battery")
	_add_interactable("hide", "locker-workshop", "Спрятаться в шкафу", Vector3(12.1,1.2,8), Color("#524238"), "hide")
	_add_interactable("generator", "main-generator", "Запустить резервный генератор", Vector3(0,1.35,-23.65), Color("#c77d52"), "panel")
	_add_interactable("gate", "service-gate", "Открыть сервисный шлюз", Vector3(0,1.5,-27.1), Color("#c77d52"), "panel")
	_add_interactable("tape", "master-tape", "Забрать мастер-ленту Л-4", Vector3(-13,1.18,-50), Color("#ad8051"), "reel")

func _add_interactable(kind: String, item_id: String, label: String, position: Vector3, color: Color, shape_kind: String) -> Area3D:
	var area := Area3D.new()
	area.name = "%s_%s" % [kind, item_id]
	area.position = position
	area.collision_layer = 1
	area.collision_mask = 0
	area.set_meta("kind", kind)
	area.set_meta("item_id", item_id)
	area.set_meta("interact_label", label)
	var collision := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = .58 if shape_kind != "panel" else .72
	collision.shape = sphere
	area.add_child(collision)
	if shape_kind == "fuse":
		var root := Node3D.new()
		root.position.y = -.17
		area.add_child(root)
		for dx in [-.23,.23]:
			var cap := MeshInstance3D.new()
			var cap_mesh := CylinderMesh.new()
			cap_mesh.top_radius = .13
			cap_mesh.bottom_radius = .13
			cap_mesh.height = .12
			cap.mesh = cap_mesh
			cap.position.x = dx
			cap.rotation.z = PI/2
			cap.material_override = mats.concrete
			root.add_child(cap)
		var glass := MeshInstance3D.new()
		var glass_mesh := CylinderMesh.new()
		glass_mesh.top_radius = .09
		glass_mesh.bottom_radius = .09
		glass_mesh.height = .38
		glass.mesh = glass_mesh
		glass.rotation.z = PI/2
		glass.material_override = _material(color, color*.2, .3)
		root.add_child(glass)
		var glow := OmniLight3D.new()
		glow.light_color = color
		glow.light_energy = .55
		glow.omni_range = 2.2
		root.add_child(glow)
	elif shape_kind == "paper":
		var paper := MeshInstance3D.new()
		var paper_mesh := BoxMesh.new()
		paper_mesh.size = Vector3(.42,.035,.3)
		paper.mesh = paper_mesh
		paper.position.y = -.36
		paper.rotation.y = .15
		paper.material_override = mats.paper
		area.add_child(paper)
	elif shape_kind == "reel":
		var reel := MeshInstance3D.new()
		var reel_mesh := CylinderMesh.new()
		reel_mesh.top_radius = .23
		reel_mesh.bottom_radius = .23
		reel_mesh.height = .09
		reel.mesh = reel_mesh
		reel.position.y = -.28
		reel.material_override = mats.dark_metal
		area.add_child(reel)
		var hub := MeshInstance3D.new()
		var hub_mesh := CylinderMesh.new()
		hub_mesh.top_radius = .07
		hub_mesh.bottom_radius = .07
		hub_mesh.height = .11
		hub.mesh = hub_mesh
		hub.position.y = -.24
		hub.material_override = mats.rust
		area.add_child(hub)
	elif shape_kind == "battery":
		var battery_mesh := MeshInstance3D.new()
		var battery_box := BoxMesh.new()
		battery_box.size = Vector3(.28,.44,.2)
		battery_mesh.mesh = battery_box
		battery_mesh.position.y = -.25
		battery_mesh.material_override = _material(Color("#707b5d"),Color("#171d13"))
		area.add_child(battery_mesh)
	else:
		var indicator := MeshInstance3D.new()
		var indicator_mesh := BoxMesh.new()
		indicator_mesh.size = Vector3(.23,.18,.08)
		indicator.mesh = indicator_mesh
		indicator.position.y = -.16
		indicator.material_override = _material(color,color*.35,.15)
		area.add_child(indicator)
	add_child(area)
	interactables.append(area)
	return area

func _build_player() -> void:
	player = PlayerController.new()
	player.name = "Player"
	player.position = Vector3(0,0,15.6)
	add_child(player)
	player.interact_requested.connect(_on_interact)
	player.interaction_hint.connect(_on_interaction_hint)
	player.state_changed.connect(_on_player_state)

func _create_creature() -> void:
	monster = Node3D.new()
	monster.name = "The Listening One"
	monster.position = Vector3(0,0,-17)
	monster.visible = false
	add_child(monster)
	var shadow_material := _material(Color("#090d0e"),Color("#100e0c"))
	monster_body = _mesh_capsule("Body",.39,1.0,shadow_material)
	monster_body.position.y = 1.25
	monster.add_child(monster_body)
	monster_head = MeshInstance3D.new()
	var head_mesh := SphereMesh.new()
	head_mesh.radius = .29
	head_mesh.height = .58
	monster_head.mesh = head_mesh
	monster_head.position.y = 2.17
	monster_head.material_override = shadow_material
	monster.add_child(monster_head)
	for x in [-.13,.13]:
		var eye := MeshInstance3D.new()
		var eye_mesh := SphereMesh.new()
		eye_mesh.radius = .035
		eye_mesh.height = .07
		eye.mesh = eye_mesh
		eye.position = Vector3(x,2.18,.255)
		eye.material_override = _material(Color("#bd4f36"),Color("#b8402d"))
		monster.add_child(eye)
		monster_eyes.append(eye)
	for side in [-1.0,1.0]:
		var arm := Node3D.new()
		arm.position = Vector3(side*.35,1.76,0)
		var arm_mesh := _mesh_capsule("Long arm",.13,.9,shadow_material)
		arm_mesh.position.y = -.42
		arm.add_child(arm_mesh)
		monster.add_child(arm)
		monster_limb_pivots.append(arm)

func _mesh_capsule(mesh_name: String, radius: float, height: float, material: Material) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.name = mesh_name
	var capsule := CapsuleMesh.new()
	capsule.radius = radius
	capsule.height = height
	instance.mesh = capsule
	instance.material_override = material
	return instance

func _build_audio() -> void:
	radio_player = AudioStreamPlayer.new()
	radio_player.name = "RadioVoice"
	radio_player.bus = "Master"
	add_child(radio_player)
	ambience_player = AudioStreamPlayer.new()
	ambience_player.name = "StationHum"
	add_child(ambience_player)
	var hum := AudioStreamGenerator.new()
	hum.mix_rate = 22050
	hum.buffer_length = .25
	ambience_player.stream = hum
	ambience_player.volume_db = -27.0

func _build_ui() -> void:
	hud_layer = CanvasLayer.new()
	hud_layer.layer = 5
	add_child(hud_layer)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_layer.add_child(root)
	menu = Control.new()
	menu.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(menu)
	var shade := ColorRect.new()
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(0.02,0.035,0.04,.94)
	menu.add_child(shade)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu.add_child(center)
	menu_panel = _make_panel()
	menu_panel.custom_minimum_size = Vector2(620,560)
	center.add_child(menu_panel)
	menu_content = VBoxContainer.new()
	menu_content.add_theme_constant_override("separation",18)
	menu_panel.add_child(menu_content)
	_build_hud(root)
	_build_document(root)
	_build_choices(root)

func _make_panel() -> PanelContainer:
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035,0.045,0.045,.97)
	style.border_color = Color(0.55,0.31,0.23,.8)
	style.set_border_width_all(1)
	style.set_corner_radius_all(2)
	style.content_margin_left = 30
	style.content_margin_right = 30
	style.content_margin_top = 26
	style.content_margin_bottom = 26
	panel.add_theme_stylebox_override("panel",style)
	return panel

func _label(text: String, size: int, color: Color = Color("#e5e1d3")) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size",size)
	label.add_theme_color_override("font_color",color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label

func _button(text: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0,46)
	button.add_theme_font_size_override("font_size",14)
	button.add_theme_color_override("font_color",Color("#eee9dc"))
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color(0.28,0.14,0.1,.8)
	normal.border_color = Color(0.64,0.34,0.24,.9)
	normal.set_border_width_all(1)
	normal.content_margin_left = 12
	normal.content_margin_right = 12
	button.add_theme_stylebox_override("normal",normal)
	button.add_theme_stylebox_override("hover",normal)
	button.pressed.connect(callback)
	return button

func _process(delta: float) -> void:
	if game_started and not game_paused and not reading_document and not choice_active:
		elapsed_seconds += delta
		clock_timer -= delta
		if clock_timer <= 0.0:
			_update_station_clock()
			clock_timer = 1.0
		if subtitles_timer > 0.0:
			subtitles_timer -= delta
			if subtitles_timer <= 0.0:
				subtitle_label.text = ""
		if message_timer > 0.0:
			message_timer -= delta
			if message_timer <= 0.0:
				message_label.text = ""
		_update_creature(delta)
		player.noise_level = maxf(0.0,player.noise_level-delta*.22)
		_update_hud()
		_update_ambience()
		if elapsed_seconds >= save_timer:
			if not monster_active or player.hidden or monster.global_position.distance_to(player.global_position) > 10.0:
				_save_game()
				save_timer = elapsed_seconds + 15.0
		_update_creature_animation()

func _input(event: InputEvent) -> void:
	if game_paused:
		return
	if event.is_action_pressed("pause") and game_started:
		if reading_document:
			_close_document()
		elif choice_active:
			return
		else:
			_pause_game()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("journal") and game_started and not reading_document and not choice_active:
		_show_journal()
		get_viewport().set_input_as_handled()

func _update_ambience() -> void:
	if not ambience_player.playing:
		return
	var playback := ambience_player.get_stream_playback() as AudioStreamGeneratorPlayback
	if playback == null:
		return
	for _index in range(playback.get_frames_available()):
		ambience_phase += TAU * 49.0 / 22050.0
		var sample := sin(ambience_phase) * .055 + sin(ambience_phase*.51) * .025
		playback.push_frame(Vector2(sample,sample))

func _build_hud(root: Control) -> void:
	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.visible = false
	root.add_child(hud)
	clock_label = _label("УЗЕЛ СВЯЗИ №13  /  03:17",12,Color("#c4c8bc"))
	clock_label.position = Vector2(30,24)
	clock_label.size = Vector2(400,30)
	hud.add_child(clock_label)
	objective_label = _label("ГЛАВА I · МЁРТВАЯ ЛИНИЯ\nНайти предохранители",13,Color("#e0ddcf"))
	objective_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	objective_label.position = Vector2(-390,24)
	objective_label.anchor_left = 1
	objective_label.anchor_right = 1
	objective_label.size = Vector2(350,56)
	hud.add_child(objective_label)
	progress_label = _label("0 / 3",11,Color("#a7aa9d"))
	progress_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	progress_label.position = Vector2(-390,82)
	progress_label.anchor_left = 1
	progress_label.anchor_right = 1
	progress_label.size = Vector2(350,24)
	hud.add_child(progress_label)
	var crosshair := _label("+",19,Color(0.9,0.9,0.84,.8))
	crosshair.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	crosshair.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	crosshair.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	crosshair.position = Vector2(-10,-14)
	crosshair.size = Vector2(20,28)
	hud.add_child(crosshair)
	prompt_label = _label("",12,Color("#ddd8c8"))
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	prompt_label.position = Vector2(-250,-130)
	prompt_label.size = Vector2(500,40)
	hud.add_child(prompt_label)
	subtitle_label = _label("",15,Color("#f0ede2"))
	subtitle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	subtitle_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	subtitle_label.position = Vector2(-460,-190)
	subtitle_label.size = Vector2(920,65)
	hud.add_child(subtitle_label)
	message_label = _label("",12,Color("#d08b69"))
	message_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	message_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	message_label.position = Vector2(-350,100)
	message_label.size = Vector2(700,38)
	hud.add_child(message_label)
	var controls := _label("WASD · ДВИЖЕНИЕ     SHIFT · БЕГ     CTRL · КРАСТЬСЯ     E · ДЕЙСТВИЕ     F · ФОНАРЬ     J · ЖУРНАЛ",10,Color("#7b8278"))
	controls.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	controls.position = Vector2(-460,-30)
	controls.size = Vector2(920,24)
	controls.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(controls)
	var meters := _label("БАТАРЕЯ 100%      ВЫНОСЛИВОСТЬ 100%",10,Color("#a9a18d"))
	meters.name = "Meters"
	meters.position = Vector2(30,-55)
	meters.anchor_top = 1
	meters.anchor_bottom = 1
	meters.size = Vector2(370,28)
	meters_label = meters
	hud.add_child(meters)

func _build_document(root: Control) -> void:
	document_panel = _make_panel()
	document_panel.set_anchors_preset(Control.PRESET_CENTER)
	document_panel.position = Vector2(-280,-180)
	document_panel.custom_minimum_size = Vector2(560,360)
	document_panel.visible = false
	document_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(document_panel)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation",16)
	document_panel.add_child(content)
	document_title_label = _label("ЗАПИСЬ",20,Color("#744b38"))
	content.add_child(document_title_label)
	document_body_label = _label("",14,Color("#282a25"))
	document_body_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(document_body_label)
	content.add_child(_button("E · ПРОДОЛЖИТЬ",_close_document))

func _build_choices(root: Control) -> void:
	choice_panel = _make_panel()
	choice_panel.set_anchors_preset(Control.PRESET_CENTER)
	choice_panel.position = Vector2(-300,-230)
	choice_panel.custom_minimum_size = Vector2(600,460)
	choice_panel.visible = false
	root.add_child(choice_panel)

func _show_title() -> void:
	menu.visible = true
	hud.visible = false
	for child in menu_content.get_children():
		child.queue_free()
	var eyebrow := _label("ИНТЕРАКТИВНАЯ ИСТОРИЯ · 1998",11,Color("#aab0a5"))
	menu_content.add_child(eyebrow)
	var title := _label("СМЕНА 13",74,Color("#e5e0d1"))
	menu_content.add_child(title)
	menu_content.add_child(_label("ЛИНИЯ ЧЕТЫРЕ",14,Color("#c27a5a")))
	var story := _label("17 октября 1998-го. Инженер Илья Волков приезжает на узел связи, откуда три ночи подряд передают голос его погибшей сестры. Дежурный Соколов просит восстановить питание и забрать мастер-ленту.",15,Color("#a9afa5"))
	menu_content.add_child(story)
	menu_content.add_child(_button("ПРОДОЛЖИТЬ СМЕНУ" if has_checkpoint else "НАЧАТЬ СМЕНУ",_start_game))
	var controls := _label("WASD — ходить   ·   мышь — смотреть   ·   E — действие\nShift — бежать   ·   Ctrl — красться   ·   F — фонарь\nEsc — пауза   ·   R — сбросить взгляд",11,Color("#838a82"))
	menu_content.add_child(controls)
	if episode2_unlocked:
		menu_content.add_child(_button("ЭПИЗОД II · БЕЛЫЙ ШУМ",_start_episode_two))
	var stamp := _label("НАТИВНАЯ ВЕРСИЯ · GODOT 4 · LINUX / WINDOWS",10,Color("#68716c"))
	menu_content.add_child(stamp)
	menu_panel.visible = true
	game_started = false
	player.controls_enabled = false
	player.release_mouse()

func _start_game() -> void:
	menu.visible = false
	hud.visible = true
	game_started = true
	game_paused = false
	reading_document = false
	choice_active = false
	player.controls_enabled = true
	player.capture_mouse()
	if not ambience_player.playing:
		ambience_player.play()
	if current_episode == 1 and phase == "fuses" and not has_checkpoint:
		_show_subtitle("СЛУЖЕБНЫЙ ЖУРНАЛ · 17 ОКТЯБРЯ 1998 · 03:17\n«Илья, если слышишь меня — не включай четвёртую линию».",5.5)
		_play_radio("sokolov-opening")
	elif current_episode == 2 and phase == "e2-records" and not has_checkpoint:
		_show_subtitle("24 ОКТЯБРЯ 1998 · 03:17\nОксана: «Я слышу себя в эфире, но я молчу».",6.0)
		_play_radio("oksana-opening")
	_refresh_objective()
	_save_game()
	if phase == "choice":
		_show_choices()
	elif phase == "e2-choice":
		_show_episode_two_choices()

func _start_episode_two() -> void:
	current_episode = 2
	phase = "e2-records"
	episode2_record_ids.clear()
	episode2_evidence.clear()
	episode2_fuses_found = 0
	episode2_dials = [0,0,0]
	episode2_power = false
	episode2_gate_open = false
	episode2_ending = ""
	ending = ""
	elapsed_seconds = 0.0
	save_timer = 0.0
	monster_active = false
	monster.visible = false
	monster_speed = .38
	player.global_position = Vector3(100,0,15.6)
	player.rotation.y = 0.0
	player.pitch = 0.0
	player.head.rotation.x = 0.0
	player.hidden = false
	player.battery = 1.0
	player.flashlight_enabled = true
	player.flashlight.visible = true
	player.stamina = 1.0
	radio_gate.position.y = 1.58
	radio_gate_collision.disabled = false
	radio_exit.position.y = 1.55
	radio_exit_collision.disabled = false
	for item in interactables:
		if str(item.get_meta("kind","" )).begins_with("episode2_"):
			item.visible = true
			item.monitoring = true
	if radio_generator_lamp.material_override is StandardMaterial3D:
		(radio_generator_lamp.material_override as StandardMaterial3D).albedo_color = Color("#873b2d")
		(radio_generator_lamp.material_override as StandardMaterial3D).emission = Color("#32130d")
	if radio_signal_lamp.material_override is StandardMaterial3D:
		(radio_signal_lamp.material_override as StandardMaterial3D).albedo_color = Color("#903b2a")
		(radio_signal_lamp.material_override as StandardMaterial3D).emission = Color("#2a100b")
	game_started = true
	game_paused = false
	reading_document = false
	choice_active = false
	hud.visible = true
	menu.visible = false
	player.controls_enabled = true
	player.capture_mouse()
	if not ambience_player.playing:
		ambience_player.play()
	_update_objective()
	_update_station_clock()
	_save_game()
	var consequence := "Сеть уже слышала твою передачу." if previous_ending == "broadcast" else "В журнале пропал час после отключения узла." if previous_ending == "erase" else "Собранные улики привели тебя к этому передатчику."
	_show_subtitle("24 ОКТЯБРЯ 1998 · 04:02\n"+consequence+" Оксана: «Не включай передатчик».",6.0)
	_play_radio("oksana-opening")

func _update_station_clock() -> void:
	var total_minutes := (4*60+2 if current_episode==2 else 3*60+17) + int(elapsed_seconds * 3.0 / 60.0)
	clock_label.text = ("РАДИОЦЕНТР  /  " if current_episode==2 else "УЗЕЛ СВЯЗИ №13  /  ") + "%02d:%02d" % [int(total_minutes / 60) % 24,total_minutes % 60]

func _refresh_objective() -> void:
	if current_episode == 2:
		match phase:
			"e2-records":
				objective_label.text = "ЭПИЗОД II · БЕЛЫЙ ШУМ\nНайти три катушки эфира"
				progress_label.text = "%d / 3" % episode2_fuses_found
			"e2-generator":
				objective_label.text = "ЭПИЗОД II · БЕЛЫЙ ШУМ\nПодать питание на передатчик"
				progress_label.text = "ЗАПИСИ НАЙДЕНЫ"
			"e2-gate":
				objective_label.text = "ЭПИЗОД II · СЕВЕРНЫЙ ШЛЮЗ\nОткрыть шлюз"
				progress_label.text = "РЕЗЕРВНОЕ ПИТАНИЕ"
			"e2-tune":
				objective_label.text = "ЭПИЗОД II · ПЕРЕДАТЧИК\nНастроить несущую"
				progress_label.text = "%d · %d · %d" % [episode2_dials[0],episode2_dials[1],episode2_dials[2]]
			"e2-choice":
				objective_label.text = "ЭПИЗОД II · БЕЛЫЙ ШУМ\nРешить судьбу передачи"
				progress_label.text = "%d УЛИК" % episode2_evidence.size()
			_:
				objective_label.text = "ЭПИЗОД II · ВЫХОД\nПокинуть радиоцентр"
				progress_label.text = "СИГНАЛ ОТКЛЮЧЁН"
		return
	match phase:
		"fuses":
			objective_label.text = "ГЛАВА I · МЁРТВАЯ ЛИНИЯ\nНайти предохранители"
			progress_label.text = "%d / 3" % fuses_found
		"generator":
			objective_label.text = "ГЛАВА I · МЁРТВАЯ ЛИНИЯ\nЗапустить резервный генератор"
			progress_label.text = "ПИТАНИЕ"
		"gate":
			objective_label.text = "ГЛАВА II · ПОД ЗЕМЛЁЙ\nОткрыть сервисный шлюз"
			progress_label.text = "ШЛЮЗ ОБЕСТОЧЕН"
		"tape":
			objective_label.text = "ГЛАВА II · ПОД ЗЕМЛЁЙ\nНайти мастер-ленту"
			progress_label.text = "АРХИВ ЛЕНТ"
		"dials":
			objective_label.text = "ГЛАВА III · ЛИНИЯ ЧЕТЫРЕ\nНастроить коммутатор"
			progress_label.text = "%d · %d · %d" % [dials[0],dials[1],dials[2]]
		"choice":
			objective_label.text = "ГЛАВА III · ЛИНИЯ ЧЕТЫРЕ\nРешить судьбу записи"
			progress_label.text = "%d УЛИК" % evidence_ids.size()
		"escape":
			objective_label.text = "ГЛАВА IV · ДО РАССВЕТА\nВернуться к южному выходу"
			progress_label.text = "СИГНАЛ ОТКЛЮЧЁН"
		_:
			objective_label.text = "СМЕНА 13"
			progress_label.text = ""

func _update_hud() -> void:
	_update_station_clock()
	meters_label.text = "БАТАРЕЯ %d%%      ВЫНОСЛИВОСТЬ %d%%" % [int(player.battery*100.0),int(player.stamina*100.0)]

func _on_interaction_hint(text: String) -> void:
	prompt_label.text = "E  ·  " + text if not text.is_empty() else ""

func _on_player_state(state_name: String, value: Variant) -> void:
	if state_name == "message":
		_show_message(str(value))
	elif state_name == "noise":
		noise_level = float(value)
		if noise_level > .4:
			last_noise_position = player.global_position
	elif state_name == "footstep":
		_play_tone(54.0 if bool(value) else 72.0,.055,.025)
	elif state_name == "stamina" and meters_label != null:
		meters_label.text = "БАТАРЕЯ %d%%      ВЫНОСЛИВОСТЬ %d%%" % [int(player.battery*100.0),int(float(value)*100.0)]
	elif state_name == "journal":
		if game_started and not game_paused and not choice_active and not reading_document:
			_show_journal()
	elif state_name == "pause":
		if game_started and not reading_document and not choice_active:
			if game_paused:
				_resume_game()
			else:
				_pause_game()

func _show_subtitle(text: String, duration: float = 3.5) -> void:
	subtitle_label.text = text
	subtitle_label.visible = true
	subtitles_timer = duration

func _show_message(text: String, duration: float = 2.4) -> void:
	message_label.text = text
	message_timer = duration

func _play_radio(file_name: String) -> void:
	var path := "res://audio/%s.ogg" % file_name
	if ResourceLoader.exists(path):
		radio_player.stream = load(path)
		radio_player.play()

func _pause_game() -> void:
	game_paused = true
	player.controls_enabled = false
	player.release_mouse()
	ambience_player.stop()
	menu.visible = true
	for child in menu_content.get_children():
		child.queue_free()
	menu_content.add_child(_label("СМЕНА ПРИОСТАНОВЛЕНА",12,Color("#c27a5a")))
	menu_content.add_child(_label("ТИШЕ.",54,Color("#e5e0d1")))
	menu_content.add_child(_label("Управление мышью можно настроить здесь.",13,Color("#a9afa5")))
	var sensitivity := HSlider.new()
	sensitivity.min_value = .00005
	sensitivity.max_value = .0025
	sensitivity.step = .00005
	sensitivity.value = player.mouse_sensitivity
	sensitivity.custom_minimum_size = Vector2(500,32)
	sensitivity.value_changed.connect(func(value: float): player.set_mouse_sensitivity(value))
	menu_content.add_child(_label("ЧУВСТВИТЕЛЬНОСТЬ МЫШИ",10,Color("#a9afa5")))
	menu_content.add_child(sensitivity)
	var invert := CheckBox.new()
	invert.text = "Инвертировать горизонтальную ось"
	invert.button_pressed = player.invert_x
	invert.toggled.connect(func(value: bool): player.set_invert_x(value))
	menu_content.add_child(invert)
	var resume_button := _button("ВЕРНУТЬСЯ",_resume_game)
	menu_content.add_child(resume_button)
	menu_content.add_child(_button("СОХРАНИТЬ И ВЫЙТИ",_return_to_title))

func _resume_game() -> void:
	game_paused = false
	menu.visible = false
	player.controls_enabled = true
	player.capture_mouse()
	if not ambience_player.playing:
		ambience_player.play()

func _return_to_title() -> void:
	_save_game()
	game_started = false
	game_paused = false
	player.controls_enabled = false
	player.release_mouse()
	ambience_player.stop()
	menu.visible = true
	_show_title()

func _on_interact(target: Object) -> void:
	if reading_document:
		_close_document()
		return
	if player.hidden:
		player.set_hidden(false)
		hiding = false
		_show_subtitle("Ты выходишь из укрытия.",1.5)
		return
	if not game_started or game_paused or choice_active or target == null or not is_instance_valid(target):
		return
	var kind := str(target.get_meta("kind",""))
	var item_id := str(target.get_meta("item_id",""))
	match kind:
		"fuse":
			if fuse_ids.has(item_id):
				return
			fuse_ids[item_id] = true
			fuses_found = fuse_ids.size()
			target.visible = false
			target.set_meta("collected",true)
			_show_message("ПРЕДОХРАНИТЕЛЬ ДОБАВЛЕН · %d/3" % fuses_found)
			_play_tone(650,.13,.045)
			if fuses_found == 1:
				monster_active = true
				monster.visible = true
				monster.position = Vector3(0,0,-17)
				camera_shake = .4
				_show_subtitle("РАЦИЯ · СОКОЛОВ: «Ты тоже видел свет в конце коридора?»",4.4)
				_play_radio("sokolov-warning")
			if fuses_found >= 3:
				phase = "generator"
				_show_subtitle("Три предохранителя на месте. Щитовая — в северном конце зала.",3.5)
			_refresh_objective()
			_save_game()
		"record":
			var record_id := str(target.get_meta("item_id"))
			if not evidence_ids.has(record_id):
				evidence_ids[record_id] = true
				journal_entries.append({"title":_record_title(record_id),"text":_record_text(record_id)})
				_save_game()
			_show_document(_record_title(record_id),_record_text(record_id))
			if record_id == "shift-log" and not monster_active:
				monster_active = true
				monster.visible = true
				monster.position = Vector3(0,0,-17)
		"battery":
			player.battery = minf(1.0,player.battery+.42)
			target.visible = false
			_save_game()
			_show_message("ЭЛЕМЕНТ ПИТАНИЯ · %d%%" % int(player.battery*100))
		"hide":
			hiding = true
			player.set_hidden(true)
			_show_subtitle("Ты затаил дыхание. Нажми E, чтобы выйти.",2.5)
		"generator":
			if fuses_found < 3:
				_show_message("НЕ ХВАТАЕТ ПРЕДОХРАНИТЕЛЕЙ · %d/3" % fuses_found)
				return
			generator_on = true
			phase = "gate"
			if generator_lamp.material_override is StandardMaterial3D:
				(generator_lamp.material_override as StandardMaterial3D).albedo_color = Color("#83ac83")
				(generator_lamp.material_override as StandardMaterial3D).emission = Color("#32683b")
			monster_speed = .56
			_play_tone(90,.45,.08)
			_show_subtitle("СОКОЛОВ: «Питание вернулось. Иди в нижний архив». ",4.0)
			_refresh_objective()
			_save_game()
		"gate":
			if not generator_on:
				_show_message("ШЛЮЗ ОБЕСТОЧЕН · НУЖЕН ГЕНЕРАТОР")
				return
			_open_door(service_door,service_door_collision)
			service_gate_open = true
			phase = "tape"
			_play_radio("sokolov-gate")
			_show_subtitle("Из тоннеля отвечает голос Соколова. Рация у тебя выключена.",4.0)
			_refresh_objective()
			_save_game()
		"tape":
			tape_found = true
			target.visible = false
			phase = "dials"
			monster_active = true
			monster.visible = true
			monster_speed = .9
			evidence_ids["master-tape"] = true
			journal_entries.append({"title":"Мастер-лента Л-4","text":"Голос Лены: «Илья, не ищи меня в комнате. Я — в линии». На коробке процарапано: 3 — 7 — 2."})
			_show_document("МАСТЕР-ЛЕНТА Л-4","Лена: «Не включай четвёртую линию. Я не в комнате. Я в проводе».\n\nНа коробке процарапано: 3 — 7 — 2.")
			_play_radio("lena-tape")
			camera_shake = .55
			_refresh_objective()
			_save_game()
		"dial":
			if not tape_found:
				_show_message("НУЖНА МАСТЕР-ЛЕНТА")
				return
			var index := int(item_id)
			dials[index] = (dials[index]+1)%10
			var dial := dial_nodes[index]
			dial.rotation.z = float(dials[index])*PI/5.0
			_play_tone(410.0+float(dials[index])*32.0,.08,.025)
			_refresh_objective()
			_save_game()
			if dials == [3,7,2]:
				phase = "choice"
				signal_tuned = true
				_show_choices()
		"exit":
			if ending.is_empty():
				_show_message("СНАЧАЛА РЕШИ, ЧТО ДЕЛАТЬ С ЗАПИСЬЮ")
				return
			_finish_game(ending)
		"episode2_record":
			if episode2_record_ids.has(item_id):
				return
			episode2_record_ids[item_id] = true
			target.visible = false
			var record: Dictionary = episode2_record_data.get(item_id,{"title":"ЗАПИСЬ","text":"На катушке слышны только помехи."})
			journal_entries.append(record)
			if item_id in ["e2-operator-log","e2-frequency-card","e2-studio-transcript"]:
				episode2_fuses_found += 1
			if not monster_active:
				monster_active = true
				monster.visible = true
				monster.position = Vector3(100,0,-17)
				monster_speed = .38
				camera_shake = .3
				_play_radio("sokolov-ep2")
			if episode2_fuses_found >= 3:
				phase = "e2-generator"
				_show_subtitle("Три катушки найдены. Щитовая — в северном конце.",3.5)
			_refresh_objective()
			_show_document(str(record.title),str(record.text))
			_save_game()
		"episode2_repair":
			episode2_evidence["e2-repair-note"] = true
			target.visible = false
			journal_entries.append(episode2_record_data["e2-repair-note"])
			_show_message("РЕМОНТНАЯ БИРКА · РУЧНОЙ БАЙПАС")
			_save_game()
		"episode2_battery":
			player.battery = minf(1.0,player.battery+.42)
			target.visible = false
			_show_message("ЭЛЕМЕНТ ПИТАНИЯ · %d%%" % int(player.battery*100))
			_save_game()
		"episode2_hide":
			hiding = true
			player.set_hidden(true)
			_show_subtitle("Ты затаил дыхание. Нажми E, чтобы выйти.",2.5)
		"episode2_generator":
			if episode2_fuses_found < 3:
				_show_message("НЕ ХВАТАЕТ КАТУШЕК · %d/3" % episode2_fuses_found)
				return
			episode2_power = true
			phase = "e2-gate"
			if radio_generator_lamp.material_override is StandardMaterial3D:
				(radio_generator_lamp.material_override as StandardMaterial3D).albedo_color = Color("#83ac83")
				(radio_generator_lamp.material_override as StandardMaterial3D).emission = Color("#32683b")
			monster_speed = .62
			_play_tone(92,.5,.08)
			_play_radio("sokolov-generator")
			_refresh_objective()
			_save_game()
		"episode2_gate":
			if not episode2_power:
				_show_message("ШЛЮЗ ОБЕСТОЧЕН · ЗАПУСТИ ГЕНЕРАТОР")
				return
			_open_door(radio_gate,radio_gate_collision)
			episode2_gate_open = true
			phase = "e2-tune"
			_play_radio("oksana-log")
			_show_subtitle("Карточка частот: нижняя полоса — 5, средняя — 1, верхняя — 9.",4.5)
			_refresh_objective()
			_save_game()
		"episode2_dial":
			if not episode2_gate_open:
				_show_message("СНАЧАЛА ОТКРОЙ СЕВЕРНЫЙ ШЛЮЗ")
				return
			var dial_index := int(item_id)
			episode2_dials[dial_index] = (episode2_dials[dial_index]+1)%10
			radio_dials[dial_index].rotation.z = float(episode2_dials[dial_index])*PI/5.0
			_play_tone(430.0+float(episode2_dials[dial_index])*32.0,.08,.02)
			_refresh_objective()
			_save_game()
			if episode2_dials == [5,1,9]:
				phase = "e2-choice"
				if radio_signal_lamp.material_override is StandardMaterial3D:
					(radio_signal_lamp.material_override as StandardMaterial3D).albedo_color = Color("#9ac08b")
					(radio_signal_lamp.material_override as StandardMaterial3D).emission = Color("#386d40")
				_show_episode_two_choices()
		"episode2_exit":
			if episode2_ending.is_empty():
				_show_message("СИГНАЛ ЕЩЁ ИДЁТ · РЕШИ, ЧТО ДЕЛАТЬ С ПЕРЕДАЧЕЙ")
				return
			_finish_game(episode2_ending)
		_:
			_show_message("ЗДЕСЬ ПОКА НИЧЕГО НЕТ")

func _record_title(record_id: String) -> String:
	match record_id:
		"shift-log": return "ЖУРНАЛ СМЕНЫ"
		"relay-report": return "АКТ РЕЛЕЙНОЙ БРИГАДЫ"
		"workshop-note": return "ЗАПИСКА НА СХЕМЕ"
		"tunnel-tag": return "БИРКА КАБЕЛЯ"
	return "ЗАПИСЬ"

func _record_text(record_id: String) -> String:
	match record_id:
		"shift-log": return "17 октября, 02:40. Линия четыре снова ожила после отключения. Из трубки говорит Лена Волкова. Она просит не запускать генератор. Лены нет в живых с 1991 года. Я снял трубку, но голос продолжал идти из динамика."
		"relay-report": return "Акт №104. Кабельный тоннель затоплен по колено. На двери архива обнаружены свежие царапины изнутри. Инженер Соколов ушёл в нижний коммутатор. В журнале время ухода: 03:24. Часы в зале показывают 03:17."
		"workshop-note": return "Порядок для ручного коммутатора: сначала вызвать линию 3, потом 7, потом 2. Не отвечать на линию 4. Если голос назовёт твоё имя — не называй своё."
		"tunnel-tag": return "Линия 4 / резерв. Кабель заменён 18.10.98. На обороте: «Она говорит из комнаты, которой здесь нет»."
	return "В журнале нет этой записи."

func _show_document(title: String, text: String) -> void:
	document_title_label.text = title
	document_body_label.text = text
	document_panel.visible = true
	reading_document = true
	player.controls_enabled = false

func _close_document() -> void:
	document_panel.visible = false
	reading_document = false
	if game_started and not game_paused and not choice_active:
		player.controls_enabled = true

func _play_tone(frequency: float, duration: float, volume: float) -> void:
	var rate := 22050
	var sample_count := int(rate*duration)
	var pcm := PackedByteArray()
	pcm.resize(sample_count*2)
	for index in range(sample_count):
		var fade := 1.0-float(index)/float(sample_count)
		var sample := int(clampf(sin(TAU*frequency*float(index)/rate)*volume*fade,-1.0,1.0)*32767.0)
		pcm.encode_s16(index*2,sample)
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = rate
	wav.stereo = false
	wav.data = pcm
	var one_shot := AudioStreamPlayer.new()
	one_shot.stream = wav
	add_child(one_shot)
	one_shot.finished.connect(one_shot.queue_free)
	one_shot.play()

func _update_objective() -> void:
	if phase == "fuses":
		objective_label.text = "ГЛАВА I · МЁРТВАЯ ЛИНИЯ\nНайти предохранители"
		progress_label.text = "%d / 3" % fuses_found
	elif phase == "generator":
		objective_label.text = "ГЛАВА I · МЁРТВАЯ ЛИНИЯ\nЗапустить генератор"
		progress_label.text = "ПИТАНИЕ"
	elif phase == "gate":
		objective_label.text = "ГЛАВА II · ПОД ЗЕМЛЁЙ\nОткрыть сервисный шлюз"
		progress_label.text = "ШЛЮЗ ОБЕСТОЧЕН"
	elif phase == "tape":
		objective_label.text = "ГЛАВА II · ПОД ЗЕМЛЁЙ\nНайти мастер-ленту"
		progress_label.text = "АРХИВ ЛЕНТ"
	elif phase == "dials":
		objective_label.text = "ГЛАВА III · ЛИНИЯ ЧЕТЫРЕ\nНастроить коммутатор"
		progress_label.text = "%d · %d · %d" % [dials[0],dials[1],dials[2]]
	elif phase == "choice":
		objective_label.text = "ГЛАВА III · ЛИНИЯ ЧЕТЫРЕ\nРешить судьбу записи"
		progress_label.text = "%d УЛИК" % evidence_ids.size()
	else:
		objective_label.text = "ГЛАВА IV · ДО РАССВЕТА\nВернуться к южному выходу"
		progress_label.text = "СИГНАЛ ОТКЛЮЧЁН"

func _update_creature(delta: float) -> void:
	if not monster_active or not is_instance_valid(monster):
		return
	var distance_to_player := monster.global_position.distance_to(player.global_position)
	if player.hidden and player.noise_level < .72:
		return
	if player.crouched and player.noise_level < .4 and distance_to_player > 4.0:
		return
	var target_position: Vector3 = last_noise_position if player.crouched and player.noise_level >= .4 else player.global_position
	var direction: Vector3 = target_position - monster.global_position
	direction.y = 0.0
	var frozen: bool = player.flashlight_enabled and player.battery > 0.0 and distance_to_player < 13.0 and player.is_looking_at(monster)
	var moving: bool = not frozen and direction.length() > 1.2
	if moving:
		direction = direction.normalized()
		var target: Vector3 = target_position
		if current_episode == 2:
			if target_position.z < -32.0 and monster.position.z > -31.0:
				target = Vector3(100,0,-33.2)
			elif target_position.z > -32.0 and monster.position.z < -33.0:
				target = Vector3(100,0,-30.8)
			elif target_position.z < -20.0 and monster.position.z > -19.0:
				target = Vector3(100,0,-21.2)
			elif target_position.z > -20.0 and monster.position.z < -21.0:
				target = Vector3(100,0,-18.8)
			elif target_position.z > -20.0 and absf(target_position.x-100.0) > 4.0:
				var door_x := 95.55 if target_position.x < 100.0 else 104.45
				var doorway_z := -8.0 if target_position.z < -3.0 else 8.0
				target = Vector3(100,0,doorway_z) if absf(monster.position.z-doorway_z) > 1.1 else Vector3(door_x,0,doorway_z)
				if absf(monster.position.x-door_x) < .7 and absf(monster.position.z-doorway_z) < 1.1:
					target = target_position
		elif absf(player.global_position.x) > 4.2:
			var doorway_z := -8.0 if player.global_position.z < 0.0 else 8.0
			if absf(monster.position.z-doorway_z) > 1.0:
				target = Vector3(0,0,doorway_z)
		monster.global_position = monster.global_position.move_toward(target,monster_speed*delta)
	monster.look_at(Vector3(target_position.x,1.4,target_position.z),Vector3.UP)
	monster.position.y = sin(elapsed_seconds*4.0)*.025
	if monster_limb_pivots.size() == 2:
		var swing := sin(elapsed_seconds*8.0)*.42 if moving else 0.0
		monster_limb_pivots[0].rotation.x = swing
		monster_limb_pivots[1].rotation.x = -swing
	if distance_to_player < 1.15:
		_finish_game("")

func _update_creature_animation() -> void:
	if not monster_active:
		return
	monster_head.rotation.z = sin(elapsed_seconds*1.7)*.08

func _show_journal() -> void:
	if not game_started or game_paused or choice_active or reading_document:
		return
	var text := "БЛОКНОТ ИНЖЕНЕРА · СМЕНА 13\n\n"
	if journal_entries.is_empty():
		text += "Пока пусто. Ищи журналы, бирки и записи эфира."
	else:
		for item in journal_entries:
			text += "%s\n%s\n\n" % [item.get("title","ЗАПИСЬ"),item.get("text","")]
	_show_document("ЖУРНАЛ ДЕЛА",text)

func _show_choices() -> void:
	choice_active = true
	player.controls_enabled = false
	player.release_mouse()
	for child in choice_panel.get_children():
		choice_panel.remove_child(child)
		child.queue_free()
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation",14)
	choice_panel.add_child(content)
	content.add_child(_label("ПОСЛЕДНЕЕ РЕШЕНИЕ · ЛИНИЯ ЧЕТЫРЕ",11,Color("#c27a5a")))
	content.add_child(_label("Что делать с записью?",26,Color("#e5e0d1")))
	content.add_child(_label("Если передать сигнал, его услышат другие станции. Если стереть — никто не узнает, что произошло. Собранные улики могут открыть третий путь.",14,Color("#a9afa5")))
	content.add_child(_button("ПЕРЕДАТЬ ЗАПИСЬ",func(): _choose_ending("broadcast")))
	content.add_child(_button("УНИЧТОЖИТЬ ЛЕНТУ",func(): _choose_ending("erase")))
	if evidence_ids.size() >= 3:
		content.add_child(_button("ОСТАВИТЬ СЛЕД · ИЗОЛИРОВАТЬ КОНТУР",func(): _choose_ending("truth")))
	choice_panel.visible = true

func _choose_ending(choice: String) -> void:
	ending = choice
	phase = "escape"
	choice_active = false
	choice_panel.visible = false
	player.controls_enabled = true
	player.capture_mouse()
	_open_door(exit_door,exit_door_collision)
	monster_active = true
	monster_speed = 1.2
	_refresh_objective()
	_show_message("ВЫХОД ОТКРЫТ · ВЕРНИСЬ К ЮЖНОЙ ДВЕРИ",3.5)
	_save_game()

func _show_episode_two_choices() -> void:
	choice_active = true
	player.controls_enabled = false
	player.release_mouse()
	for child in choice_panel.get_children():
		choice_panel.remove_child(child)
		child.queue_free()
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation",14)
	choice_panel.add_child(content)
	var consequence := "После эфира узла №13 сигнал уже звучит на семнадцати частотах." if previous_ending == "broadcast" else "После уничтожения мастер-ленты районный журнал потерял целый час." if previous_ending == "erase" else "Твои улики привели к передатчику, но источник сигнала всё ещё не найден."
	content.add_child(_label("ЭПИЗОД II · ПОСЛЕДНЕЕ РЕШЕНИЕ",11,Color("#c27a5a")))
	content.add_child(_label("КТО ГОВОРИТ В ЭФИРЕ?",26,Color("#e5e0d1")))
	content.add_child(_label(consequence+" Оксана просит предупредить город или оборвать несущую.",14,Color("#a9afa5")))
	content.add_child(_button("ПРЕДУПРЕДИТЬ ГОРОД",func(): _choose_episode_two("e2-broadcast")))
	content.add_child(_button("ЗАГЛУШИТЬ НЕСУЩУЮ",func(): _choose_episode_two("e2-jam")))
	if episode2_evidence.has("e2-repair-note"):
		content.add_child(_button("ЗАМКНУТЬ КОНТУР · СОХРАНИТЬ КОПИЮ",func(): _choose_episode_two("e2-isolate")))
	choice_panel.visible = true

func _choose_episode_two(choice: String) -> void:
	episode2_ending = choice
	phase = "e2-escape"
	choice_active = false
	choice_panel.visible = false
	player.controls_enabled = true
	player.capture_mouse()
	_open_door(radio_exit,radio_exit_collision)
	monster_active = true
	monster_speed = 1.15
	_refresh_objective()
	_show_message("ВЫХОД ОТКРЫТ · ВЕРНИСЬ К ЮЖНОМУ ВХОДУ",3.5)
	_save_game()

func _finish_episode_two(result: String) -> void:
	game_started = false
	game_paused = false
	player.controls_enabled = false
	player.release_mouse()
	ambience_player.stop()
	hud.visible = false
	menu.visible = true
	for child in menu_content.get_children():
		child.queue_free()
	var title := "СВЯЗЬ ПОТЕРЯНА" if result.is_empty() else "ОБЩИЙ ЭФИР" if result == "e2-broadcast" else "БЕЛЫЙ ШУМ" if result == "e2-jam" else "ЗАПЕРТЫЙ КОНТУР"
	var story_text := "Ты не успел выбраться из радиоцентра. Утром передатчик продолжал работать, хотя питание было отключено." if result.is_empty() else "Ты предупредил город. На рассвете эфир стих, но в каждом радиоприёмнике остался голос, который знает имена слушателей." if result == "e2-broadcast" else "Ты перегрузил передатчик. Несущая исчезла, а вместе с ней — голос Оксаны. Соколов спросил, слышал ли ты своё имя после отключения." if result == "e2-jam" else "Ты сохранил копию записей и замкнул сигнал на пустой несущей. Город проснулся в тишине. На ленте осталось: «Северный узел всё ещё работает»."
	menu_content.add_child(_label("РАЙОННЫЙ РАДИОЦЕНТР · %s" % clock_label.text.get_slice("/ ",1),11,Color("#c27a5a")))
	menu_content.add_child(_label(title,50,Color("#e5e0d1")))
	menu_content.add_child(_label(story_text,15,Color("#a9afa5")))
	menu_content.add_child(_button("ПЕРЕИГРАТЬ С КОНТРОЛЬНОЙ ТОЧКИ",func(): get_tree().reload_current_scene()))
	if not result.is_empty():
		menu_content.add_child(_button("В ГЛАВНОЕ МЕНЮ",func(): _return_to_title()))
		menu_content.add_child(_label("ЭПИЗОД III · «ГОЛОС» — ДАЛЬШЕ ПО ПЛАНУ",10,Color("#777f76")))

func _finish_game(result: String) -> void:
	if current_episode == 2:
		_finish_episode_two(result)
		return
	game_started = false
	game_paused = false
	player.controls_enabled = false
	player.release_mouse()
	ambience_player.stop()
	hud.visible = false
	menu.visible = true
	for child in menu_content.get_children():
		child.queue_free()
	if not result.is_empty() and current_episode == 1:
		episode2_unlocked = true
		previous_ending = result
	var title := "СИГНАЛ ПОТЕРЯН" if result.is_empty() else "ЭФИР" if result == "broadcast" else "ТИШИНА" if result == "erase" else "ПАМЯТЬ"
	var text := "Ты не успел выбраться. В журнале смены утром нашли только одну фразу: «Не отвечай, если услышишь своё имя»." if result.is_empty() else "Ты передал запись по аварийному каналу. На рассвете станция замолчала, но голос Лены появился на других частотах." if result == "broadcast" else "Ты сжёг ленту и перерезал линию. Впервые за семь лет в рации стало тихо." if result == "erase" else "Ты сохранил доказательства и замкнул сигнал. Голос Лены сказал: «Теперь можешь идти»."
	menu_content.add_child(_label("ЗАПИСЬ СМЕНЫ · %s" % clock_label.text.get_slice("/ ",1),11,Color("#c27a5a")))
	menu_content.add_child(_label(title,52,Color("#e5e0d1")))
	menu_content.add_child(_label(text,15,Color("#a9afa5")))
	menu_content.add_child(_label("НАЙДЕНО УЛИК: %d" % evidence_ids.size(),11,Color("#b8a989")))
	menu_content.add_child(_button("ПЕРЕИГРАТЬ С КОНТРОЛЬНОЙ ТОЧКИ",func(): get_tree().reload_current_scene()))
	if not result.is_empty():
		menu_content.add_child(_button("В ГЛАВНОЕ МЕНЮ",func(): _return_to_title()))
		if current_episode == 1:
			menu_content.add_child(_button("ПЕРЕЙТИ К ЭПИЗОДУ II · БЕЛЫЙ ШУМ",_start_episode_two))
		else:
			menu_content.add_child(_label("ЭПИЗОД III · «ГОЛОС» — СЛЕДУЮЩИЙ ЭТАП НАТИВНОГО ПОРТА",10,Color("#777f76")))
		_save_game()

func _open_door(door: StaticBody3D, collision: CollisionShape3D) -> void:
	if collision != null:
		collision.set_deferred("disabled",true)
	var tween := create_tween()
	tween.tween_property(door,"position:y",door.position.y+3.6,1.4).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	_play_tone(90,.8,.1)

func _save_game() -> void:
	var config := ConfigFile.new()
	config.set_value("run","current_episode",current_episode)
	config.set_value("run","phase",phase)
	config.set_value("run","fuses",fuses_found)
	config.set_value("run","fuse_ids",fuse_ids.keys())
	config.set_value("run","generator",generator_on)
	config.set_value("run","gate_open",service_gate_open)
	config.set_value("run","tape",tape_found)
	config.set_value("run","dials",dials)
	config.set_value("run","signal_tuned",signal_tuned)
	config.set_value("run","ending",ending)
	config.set_value("run","evidence_ids",evidence_ids.keys())
	config.set_value("run","journal",journal_entries)
	config.set_value("run","player_position",player.global_position)
	config.set_value("run","player_yaw",player.rotation.y)
	config.set_value("run","elapsed_seconds",elapsed_seconds)
	config.set_value("run","battery",player.battery)
	config.set_value("run","episode2_unlocked",episode2_unlocked)
	config.set_value("run","previous_ending",previous_ending)
	config.set_value("episode2","record_ids",episode2_record_ids.keys())
	config.set_value("episode2","evidence_ids",episode2_evidence.keys())
	config.set_value("episode2","records_found",episode2_fuses_found)
	config.set_value("episode2","dials",episode2_dials)
	config.set_value("episode2","power",episode2_power)
	config.set_value("episode2","gate_open",episode2_gate_open)
	config.set_value("episode2","ending",episode2_ending)
	config.save(SAVE_PATH_E1 if current_episode == 1 else SAVE_PATH_E2)
	has_checkpoint = true

func _load_checkpoint() -> void:
	var config := ConfigFile.new()
	if FileAccess.file_exists(SAVE_PATH_LEGACY):
		var legacy := ConfigFile.new()
		if legacy.load(SAVE_PATH_LEGACY) == OK:
			var episode := int(legacy.get_value("run","current_episode",1))
			legacy.save(SAVE_PATH_E1 if episode == 1 else SAVE_PATH_E2)
			DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH_LEGACY))
	var preferred := SAVE_PATH_E1
	if current_episode == 2 or config.load(SAVE_PATH_E1) != OK:
		preferred = SAVE_PATH_E2
	if config.load(preferred) != OK:
		has_checkpoint = false
		return
	has_checkpoint = true
	current_episode = int(config.get_value("run","current_episode",1))
	phase = str(config.get_value("run","phase","fuses"))
	fuses_found = int(config.get_value("run","fuses",0))
	fuse_ids.clear()
	for value in config.get_value("run","fuse_ids",[]):
		fuse_ids[str(value)] = true
	generator_on = bool(config.get_value("run","generator",false))
	service_gate_open = bool(config.get_value("run","gate_open",false))
	tape_found = bool(config.get_value("run","tape",false))
	dials = config.get_value("run","dials",[0,0,0])
	signal_tuned = bool(config.get_value("run","signal_tuned",false))
	ending = str(config.get_value("run","ending",""))
	evidence_ids.clear()
	for value in config.get_value("run","evidence_ids",[]):
		evidence_ids[str(value)] = true
	journal_entries = config.get_value("run","journal",[])
	elapsed_seconds = float(config.get_value("run","elapsed_seconds",0.0))
	player.global_position = config.get_value("run","player_position",Vector3(0,0,15.6))
	player.rotation.y = float(config.get_value("run","player_yaw",0.0))
	player.battery = float(config.get_value("run","battery",1.0))
	episode2_unlocked = bool(config.get_value("run","episode2_unlocked",false))
	previous_ending = str(config.get_value("run","previous_ending",""))
	episode2_record_ids.clear()
	for value in config.get_value("episode2","record_ids",[]):
		episode2_record_ids[str(value)] = true
	episode2_evidence.clear()
	for value in config.get_value("episode2","evidence_ids",[]):
		episode2_evidence[str(value)] = true
	episode2_fuses_found = int(config.get_value("episode2","records_found",0))
	episode2_dials = config.get_value("episode2","dials",[0,0,0])
	episode2_power = bool(config.get_value("episode2","power",false))
	episode2_gate_open = bool(config.get_value("episode2","gate_open",false))
	episode2_ending = str(config.get_value("episode2","ending",""))
	for item in interactables:
		var item_id := str(item.get_meta("item_id",""))
		if item.get_meta("kind","") == "fuse" and fuse_ids.has(item_id):
			item.visible = false
		if item.get_meta("kind","") in ["record","tape"] and evidence_ids.has(item_id):
			item.visible = false
		var kind := str(item.get_meta("kind",""))
		if kind == "episode2_record" and episode2_record_ids.has(item_id):
			item.visible = false
		if kind == "episode2_repair" and episode2_evidence.has(item_id):
			item.visible = false
	if generator_on and generator_lamp.material_override is StandardMaterial3D:
		(generator_lamp.material_override as StandardMaterial3D).albedo_color = Color("#83ac83")
		(generator_lamp.material_override as StandardMaterial3D).emission = Color("#32683b")
	if service_gate_open:
		service_door.position.y = 5.2
		service_door_collision.disabled = true
	if ending != "":
		exit_door.position.y = 5.1
		exit_door_collision.disabled = true
	if episode2_power and radio_generator_lamp.material_override is StandardMaterial3D:
		(radio_generator_lamp.material_override as StandardMaterial3D).albedo_color = Color("#83ac83")
		(radio_generator_lamp.material_override as StandardMaterial3D).emission = Color("#32683b")
	for index in range(3):
		radio_dials[index].rotation.z = float(episode2_dials[index])*PI/5.0
	if episode2_gate_open:
		radio_gate.position.y = 5.2
		radio_gate_collision.disabled = true
	if episode2_ending != "":
		radio_exit.position.y = 5.1
		radio_exit_collision.disabled = true
	if (current_episode == 1 and (phase != "fuses" or fuse_ids.size() > 0 or evidence_ids.has("shift-log"))) or (current_episode == 2 and episode2_fuses_found > 0):
		monster_active = true
		monster.visible = true
		monster.position = Vector3(100,0,-17) if current_episode == 2 else Vector3(0,0,-17)
	_refresh_objective()
