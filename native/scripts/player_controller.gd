extends CharacterBody3D
class_name ShiftPlayer

signal interact_requested(target: Object)
signal interaction_hint(text: String)
signal state_changed(name: String, value: Variant)

const MOUSE_SETTING_PATH := "user://shift13_settings.cfg"
const GRAVITY := 9.8
const WALK_SPEED := 2.65
const SPRINT_SPEED := 4.6
const CROUCH_SPEED := 1.25

var head: Node3D
var camera: Camera3D
var flashlight: SpotLight3D
var interaction_ray: RayCast3D
var body_shape: CollisionShape3D
var current_target: Object
var mouse_sensitivity := 0.0015
var invert_x := false
var pitch := 0.0
var stamina := 1.0
var battery := 1.0
var flashlight_enabled := true
var crouched := false
var is_sprinting := false
var noise_level := 0.0
var footstep_timer := 0.0
var hidden := false
var controls_enabled := true
var pending_mouse := Vector2.ZERO
var ignore_next_mouse_motion := false

func _ready() -> void:
	_add_input_actions()
	_load_settings()
	_build_player_rig()
	capture_mouse()

func _add_input_actions() -> void:
	_add_key_action("move_forward", KEY_W)
	_add_key_action("move_back", KEY_S)
	_add_key_action("move_left", KEY_A)
	_add_key_action("move_right", KEY_D)
	_add_key_action("sprint", KEY_SHIFT)
	_add_key_action("crouch", KEY_CTRL)
	_add_key_action("interact", KEY_E)
	_add_key_action("flashlight", KEY_F)
	_add_key_action("journal", KEY_J)
	_add_key_action("reset_view", KEY_R)
	_add_key_action("pause", KEY_ESCAPE)

func _add_key_action(action: String, key: int) -> void:
	if InputMap.has_action(action):
		return
	InputMap.add_action(action)
	var event := InputEventKey.new()
	event.physical_keycode = key
	InputMap.action_add_event(action, event)

func _load_settings() -> void:
	var config := ConfigFile.new()
	if config.load(MOUSE_SETTING_PATH) == OK:
		var stored := float(config.get_value("controls", "sensitivity", mouse_sensitivity))
		var version := int(config.get_value("controls", "version", 0))
		if version < 3:
			if stored < .0008:
				stored = .0015
			invert_x = false
			config.set_value("controls","sensitivity",stored)
			config.set_value("controls","invert_x",false)
			config.set_value("controls","version",3)
			config.save(MOUSE_SETTING_PATH)
		mouse_sensitivity = clampf(stored, 0.00005, 0.0025)
		invert_x = bool(config.get_value("controls", "invert_x", false))

func save_settings() -> void:
	var config := ConfigFile.new()
	config.set_value("controls", "sensitivity", mouse_sensitivity)
	config.set_value("controls", "invert_x", invert_x)
	config.set_value("controls", "version", 3)
	config.save(MOUSE_SETTING_PATH)

func set_mouse_sensitivity(value: float) -> void:
	mouse_sensitivity = clampf(value, 0.00005, 0.0025)
	save_settings()

func set_invert_x(value: bool) -> void:
	invert_x = value
	save_settings()

func _build_player_rig() -> void:
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.31
	capsule.height = 1.82
	body_shape = CollisionShape3D.new()
	body_shape.shape = capsule
	body_shape.position.y = capsule.height * 0.5
	add_child(body_shape)

	head = Node3D.new()
	head.name = "Head"
	head.position.y = 1.62
	add_child(head)
	camera = Camera3D.new()
	camera.name = "Camera"
	camera.current = true
	camera.fov = 76.0
	head.add_child(camera)

	interaction_ray = RayCast3D.new()
	interaction_ray.name = "InteractionRay"
	interaction_ray.target_position = Vector3(0, 0, -2.5)
	interaction_ray.collision_mask = 1
	interaction_ray.collide_with_areas = true
	interaction_ray.collide_with_bodies = true
	interaction_ray.add_exception(self)
	interaction_ray.enabled = true
	camera.add_child(interaction_ray)

	flashlight = SpotLight3D.new()
	flashlight.name = "HandLamp"
	flashlight.light_color = Color(0.79, 0.83, 0.79)
	flashlight.light_energy = 4.5
	flashlight.spot_range = 24.0
	flashlight.spot_angle = 38.0
	flashlight.spot_attenuation = 1.1
	flashlight.position = Vector3(0.12, -0.12, -0.18)
	camera.add_child(flashlight)
	_update_flashlight()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		if ignore_next_mouse_motion:
			ignore_next_mouse_motion = false
			return
		pending_mouse.x = clampf(pending_mouse.x + event.relative.x, -1200.0, 1200.0)
		pending_mouse.y = clampf(pending_mouse.y + event.relative.y, -1200.0, 1200.0)
	elif event.is_action_pressed("interact"):
		if hidden:
			interact_requested.emit(null)
		elif current_target != null and is_instance_valid(current_target):
			interact_requested.emit(current_target)
	elif event.is_action_pressed("flashlight"):
		if controls_enabled:
			_toggle_flashlight()
	elif event.is_action_pressed("reset_view"):
		rotation.y = 0.0
		pitch = 0.0
		head.rotation.x = 0.0
		pending_mouse = Vector2.ZERO
		state_changed.emit("message", "ВЗГЛЯД СБРОШЕН")
	elif event.is_action_pressed("journal"):
		state_changed.emit("journal", null)
	elif event.is_action_pressed("pause"):
		pass

func _physics_process(delta: float) -> void:
	if controls_enabled and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED and not hidden:
		# Collect relative mouse deltas and apply a bounded turn rate, avoiding pointer-lock spikes.
		var yaw_delta := clampf(pending_mouse.x * mouse_sensitivity, -delta * 1.4, delta * 1.4)
		var pitch_delta := clampf(pending_mouse.y * mouse_sensitivity * 0.55, -delta * 0.9, delta * 0.9)
		var yaw_sign := 1.0 if invert_x else -1.0
		rotation.y += yaw_delta * yaw_sign
		pitch = clampf(pitch - pitch_delta, -1.12, 1.12)
		head.rotation.x = pitch
		pending_mouse = Vector2.ZERO
	else:
		pending_mouse = Vector2.ZERO

	if hidden or not controls_enabled:
		velocity = Vector3.ZERO
		noise_level = 0.0
		is_sprinting = false
		return

	var input_vector := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var is_crouching := Input.is_action_pressed("crouch")
	crouched = is_crouching
	var is_sprinting := Input.is_action_pressed("sprint") and not is_crouching and stamina > 0.02 and input_vector.length() > 0.1
	self.is_sprinting = is_sprinting
	noise_level = 1.0 if is_sprinting else .18 if is_crouching and input_vector.length() > .1 else .42 if input_vector.length() > .1 else 0.0
	var move_speed := CROUCH_SPEED if is_crouching else SPRINT_SPEED if is_sprinting else WALK_SPEED
	var local_direction := Vector3(input_vector.x, 0.0, input_vector.y)
	var direction := (global_basis * local_direction).normalized()
	var moving := input_vector.length() > 0.1
	velocity.x = direction.x * move_speed
	velocity.z = direction.z * move_speed
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	else:
		velocity.y = 0.0
	if is_sprinting:
		stamina = maxf(0.0, stamina - delta * 0.24)
	else:
		stamina = minf(1.0, stamina + delta * 0.16)
	move_and_slide()
	_update_crouch(is_crouching)
	_update_target()
	noise_level = 0.95 if is_sprinting else 0.16 if is_crouching and moving else 0.42 if moving else 0.0
	footstep_timer -= delta
	if moving and footstep_timer <= 0.0:
		footstep_timer = .32 if is_sprinting else .68 if is_crouching else .5
		state_changed.emit("footstep", is_sprinting)
	state_changed.emit("noise",noise_level)
	if flashlight_enabled and battery > 0.0:
		battery = maxf(0.0, battery - delta * 0.0012)
		if battery <= 0.0:
			flashlight_enabled = false
			_update_flashlight()
	state_changed.emit("stamina", stamina)
	state_changed.emit("battery", battery)

func _update_crouch(value: bool) -> void:
	var capsule := body_shape.shape as CapsuleShape3D
	capsule.height = 1.32 if value else 1.82
	body_shape.position.y = capsule.height * 0.5
	head.position.y = 1.12 if value else 1.62

func _update_target() -> void:
	interaction_ray.force_raycast_update()
	var next_target: Object = interaction_ray.get_collider() if interaction_ray.is_colliding() else null
	if next_target != current_target:
		current_target = next_target
		var hint := ""
		if current_target != null and is_instance_valid(current_target) and current_target.has_meta("interact_label"):
			hint = str(current_target.get_meta("interact_label"))
		interaction_hint.emit(hint)

func _toggle_flashlight() -> void:
	if battery <= 0.0:
		state_changed.emit("message", "БАТАРЕЯ РАЗРЯЖЕНА")
		return
	flashlight_enabled = not flashlight_enabled
	_update_flashlight()
	state_changed.emit("flashlight", flashlight_enabled)

func _update_flashlight() -> void:
	flashlight.visible = flashlight_enabled and battery > 0.0

func is_looking_at(target: Node3D, threshold: float = 0.45) -> bool:
	var to_target := (target.global_position - camera.global_position).normalized()
	return -camera.global_basis.z.dot(to_target) >= threshold

func capture_mouse() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	ignore_next_mouse_motion = true

func release_mouse() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	pending_mouse = Vector2.ZERO

func set_hidden(value: bool) -> void:
	hidden = value
	if hidden:
		velocity = Vector3.ZERO
