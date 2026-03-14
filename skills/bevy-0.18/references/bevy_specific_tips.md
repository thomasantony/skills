# Bevy-Specific Development Tips

## Bevy 0.18 API Changes

**Important:** Bevy 0.18 introduced several breaking API changes from 0.17. If you encounter compilation errors, refer to this section.

### RenderTarget Is Now a Component

In Bevy 0.18, `RenderTarget` has been moved from a field on `Camera` to a separate required component:

```rust
// Bevy 0.17 - camera.target field
commands.spawn((
    Camera3d::default(),
    Camera {
        target: RenderTarget::Image(image_handle.into()),
        ..default()
    },
));

// Bevy 0.18 - RenderTarget is a component
commands.spawn((
    Camera3d::default(),
    RenderTarget::Image(image_handle.into()),
));
```

**Error symptoms:**
- `no field 'target' on type Camera`
- Missing `RenderTarget` when spawning cameras with custom render targets

**Solution:** Spawn `RenderTarget` as a separate component alongside the camera.

### AmbientLight Split

`AmbientLight` has been split into two types:
- `AmbientLight` — a **component** added to a `Camera` to override the default ambient light
- `GlobalAmbientLight` — a **resource** for the default ambient light (replaces the old `AmbientLight` resource)

```rust
// Bevy 0.17
app.insert_resource(AmbientLight {
    color: Color::WHITE,
    brightness: 2000.,
    ..default()
});

// Bevy 0.18
app.insert_resource(GlobalAmbientLight {
    color: Color::WHITE,
    brightness: 2000.,
    ..default()
});

// Per-camera override (new in 0.18)
commands.spawn((
    Camera3d::default(),
    AmbientLight {
        color: Color::srgb(1.0, 0.9, 0.8),
        brightness: 500.,
        ..default()
    },
));
```

**Error symptoms:**
- `AmbientLight` used as resource produces unexpected behavior
- Ambient light not applying globally

**Solution:** Use `GlobalAmbientLight` for the resource, `AmbientLight` for per-camera overrides.

### State Transitions Always Fire

In 0.18, `next_state.set()` **always** triggers `OnEnter` and `OnExit` schedules, even if the state is already the same. This is a behavior change from 0.17 where setting the same state was a no-op.

```rust
// Bevy 0.17 - setting same state does nothing
next_state.set(GameState::Menu); // No-op if already Menu

// Bevy 0.18 - always triggers OnEnter/OnExit
next_state.set(GameState::Menu); // Fires OnExit(Menu) then OnEnter(Menu)!

// Bevy 0.18 - use set_if_neq for old behavior
next_state.set_if_neq(GameState::Menu); // No-op if already Menu
```

**Error symptoms:**
- `OnEnter`/`OnExit` systems running unexpectedly
- State initialization logic running multiple times
- Flickering or reset behavior when setting same state

**Solution:** Replace `next_state.set()` with `next_state.set_if_neq()` wherever you want to avoid re-triggering transitions for the same state.

### Immutable Entity Events

`EntityEvent` is now immutable by default. The mutable methods (`EntityEvent::from` and `EntityEvent::event_target_mut`) have been moved to the `SetEntityEventTarget` trait.

`SetEntityEventTarget` is automatically implemented for propagated events (`#[entity_event(propagate)]`).

**Error symptoms:**
- `method 'event_target_mut' not found`
- Cannot modify entity event target

**Solution:** Import `SetEntityEventTarget` trait if you need mutable access to entity event targets.

### Internal Component Removed

The `Internal` component has been removed. Observer and one-shot system entities are no longer hidden by default query filters.

**Error symptoms:**
- `Internal` not found in scope
- Tests relying on specific entity counts break

**Solution:** Remove all references to `Internal`. Refactor tests to query for specific components rather than counting all entities.

### Material Component Wrapper (unchanged from 0.17)

Material handles remain wrapped in `MeshMaterial3d<T>`:

```rust
// Use the wrapper component
Query<&MeshMaterial3d<StandardMaterial>>

// Access the inner handle with .0
fn update_materials(
    query: Query<&MeshMaterial3d<StandardMaterial>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    for material_3d in query.iter() {
        if let Some(material) = materials.get_mut(&material_3d.0) {
            material.emissive = LinearRgba::RED;
        }
    }
}
```

### Observer Pattern (unchanged from 0.17)

Bevy 0.17+ uses observers as a replacement for the old event system:

```rust
#[derive(Event, Clone)]  // Must derive Clone!
struct SpellCastEvent { spell_name: String }

app.add_observer(handle_spell_cast);  // Observer, not system

fn handle_spell_cast(
    trigger: Trigger<SpellCastEvent>,  // Trigger parameter
    // ... other system params
) {
    let event = trigger.event();
    info!("Cast: {}", event.spell_name);
}

fn cast_spell(mut commands: Commands) {
    commands.trigger(SpellCastEvent { spell_name: "Fireball".into() });
}
```

**Key points:**
- Events **must derive `Clone`** in addition to `Event`
- Use `add_observer(handler)` instead of `add_event()` + `add_systems()`
- Handler takes `Trigger<T>` as first parameter, use `.event()` to access data
- Trigger with `commands.trigger()` instead of `EventWriter::send()`
- Observers are not systems - they're called directly when triggered

### Mesh try_* Functions

In 0.18, `Assets<Mesh>` retains `RenderAssetUsages::RENDER_WORLD`-only meshes even after extraction. Use `try_*` variants when working with meshes that may be render-world-only:

```rust
// Bevy 0.17
let positions = mesh.attribute(Mesh::ATTRIBUTE_POSITION);
mesh.insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals);
mesh.compute_normals();

// Bevy 0.18 - use try_* when RENDER_WORLD-only meshes are possible
let positions = mesh.try_attribute(Mesh::ATTRIBUTE_POSITION)?;
mesh.try_insert_attribute(Mesh::ATTRIBUTE_NORMAL, normals)?;
mesh.try_compute_normals()?;
```

**Error symptoms:**
- `method 'attribute' not found` (if old methods were removed)
- Unexpected `MeshAccessError::ExtractedToRenderWorld` errors

**Solution:** Use `try_*` equivalents when `Assets<Mesh>` may contain render-world-only meshes.

### Feature Renames

Several Cargo features have been renamed:
- `animation` -> `gltf_animation`
- `bevy_sprite_picking_backend` -> `sprite_picking`
- `bevy_ui_picking_backend` -> `ui_picking`
- `bevy_mesh_picking_backend` -> `mesh_picking`

Update your `Cargo.toml` feature flags accordingly.

### Input Source Features

Input sources are now behind feature flags. If you use `bevy_window` or `bevy_gilrs`, the necessary features are enabled automatically. Otherwise, enable them manually:

```toml
# Bevy 0.18 with specific input sources
bevy = { version = "0.18", default-features = false, features = [
  "mouse",
  "keyboard",
  "gamepad",
  "touch",
  "gestures",
] }
```

### Entity Commands Changes

`Commands::get_entity` no longer errors for non-spawned entities — it's now useful for amending entities queued to spawn through commands. Use `Commands::get_spawned_entity` if you only want spawned entities.

```rust
// Bevy 0.17
let entity_commands = commands.get_entity(entity); // Errors if not spawned

// Bevy 0.18
let entity_commands = commands.get_spawned_entity(entity); // Only spawned entities
let entity_commands = commands.get_entity(entity); // Also works for queued-to-spawn
```

### LoadContext Path Changes

`LoadContext::asset_path` has been removed. `LoadContext::path` now returns `AssetPath` instead of `&Path`:

```rust
// Bevy 0.17
let asset_path = load_context.asset_path();
let file_path = load_context.path();

// Bevy 0.18
let asset_path = load_context.path();           // Returns AssetPath
let file_path = load_context.path().path();      // Returns &Path
```

Prefer using `AssetPath` with `AssetPath::resolve_embed` to properly support custom asset sources.

### Image Loader Array Textures

`ImageLoader` now supports loading array textures directly via settings:

```rust
use bevy::image::{ImageLoaderSettings, ImageArrayLayout};

let array_texture = asset_server.load_with_settings(
    "textures/array_texture.png",
    |settings: &mut ImageLoaderSettings| {
        settings.array_layout = Some(ImageArrayLayout::RowCount { rows: 4 });
    },
);
```

This replaces the old pattern of loading an image and then calling `Image::reinterpret_stacked_2d_as_array` in a system.

### Reflect Attribute Syntax

`#[reflect(...)]` now only supports parentheses:

```rust
// Bevy 0.17 - all of these worked
#[reflect(Clone)]
#[reflect[Clone]]
#[reflect{Clone}]

// Bevy 0.18 - only parentheses
#[reflect(Clone)]
```

### Tilemap Chunk Layout

`TilemapChunk` origin has changed from top-left to bottom-left, aligning with Bevy's world coordinate system. You can now simply mod world coordinates to get chunk coordinates without y-inversion.

### Winit User Events

`WinitPlugin` and `EventLoopProxyWrapper` are no longer generic. Use the `WinitUserEvent` type:

```rust
// Bevy 0.17
fn wakeup_system(event_loop_proxy: Res<EventLoopProxyWrapper<WakeUp>>) -> Result {
    event_loop_proxy.send_event(WakeUp)?;
    Ok(())
}

// Bevy 0.18
fn wakeup_system(event_loop_proxy: Res<EventLoopProxyWrapper>) -> Result {
    event_loop_proxy.send_event(WinitUserEvent::WakeUp)?;
    Ok(())
}
```

### Color Operations (unchanged from 0.17)

Direct color arithmetic operations aren't supported:

```rust
// Doesn't compile
let emissive = color * 0.5;

// Extract components manually
let emissive = Color::srgb(
    color.to_srgba().red * 0.5,
    color.to_srgba().green * 0.5,
    color.to_srgba().blue * 0.5,
);

// Or use LinearRgba for math operations
let linear = color.to_linear();
let dimmed = LinearRgba::rgb(
    linear.red * 0.5,
    linear.green * 0.5,
    linear.blue * 0.5,
);
```

---

## Using Bevy Registry Examples

**The registry examples are your bible.** Bevy ships with extensive examples that demonstrate best practices and patterns.

**Location:**
```bash
~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/bevy-0.18.*/examples
```

**When to consult registry examples:**
- Before implementing a new feature type
- When unsure about API usage
- To see working patterns for complex systems
- To understand how plugins should be structured
- For reference implementations of common game mechanics

**How to use them:**
1. Browse the examples directory for relevant use cases
2. Study the complete implementation (not just snippets)
3. Note how they structure components, systems, and plugins
4. Adapt patterns to your specific needs

There are MANY examples covering:
- 2D/3D rendering
- Animation
- Audio
- Input handling
- UI systems
- Physics
- Scenes and assets
- And much more

**Always refer to examples before diving into implementation.**

## Plugin Structure

Break your app into discrete modules using plugins whenever possible.

**Why use plugins:**
- Organizes code by feature/domain
- Makes systems reusable
- Improves code discoverability
- Enables modular development
- Follows Bevy best practices

**Plugin pattern:**
```rust
use bevy::prelude::*;

pub struct CombatPlugin;

impl Plugin for CombatPlugin {
    fn build(&self, app: &mut App) {
        app
            .add_event::<DamageEvent>()
            .add_systems(Startup, setup_combat)
            .add_systems(Update, (
                process_damage,
                check_death,
                update_health_bars,
            ));
    }
}

// In main.rs
fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(CombatPlugin)
        .add_plugins(MovementPlugin)
        .add_plugins(UIPlugin)
        .run();
}
```

**References:**
- Plugin guide: https://bevy.org/learn/quick-start/getting-started/plugins/
- System sets: https://bevy-cheatbook.github.io/programming/system-sets.html

## Build Performance and Optimization

### Dynamic Linking

**Always use dynamic linking during development:**
```bash
cargo build --features bevy/dynamic_linking
```

**Why:**
- 2-3x faster compile times
- Critical for iteration speed
- Only affects development builds

**Setup in `.cargo/config.toml`:**
```toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=lld"]

[target.x86_64-apple-darwin]
rustflags = ["-C", "link-arg=-fuse-ld=/usr/local/opt/llvm/bin/ld64.lld"]
```

**Optimization levels** - See: https://bevy.org/learn/quick-start/getting-started/setup/

For faster dev builds, add to `Cargo.toml`:
```toml
[profile.dev]
opt-level = 1

[profile.dev.package."*"]
opt-level = 3
```

### Build Management

**CRITICAL: Do not delete target binaries freely!**

Bevy takes **minutes** to rebuild from scratch. Be mindful of:

1. **Target directory management:**
   - Avoid `cargo clean` unless absolutely necessary
   - Incremental builds are your friend
   - Each clean rebuild costs valuable development time

2. **Version and dependency management:**
   - Bevy is under active development
   - Be mindful of the version you are using
   - Dependencies can get tangled easily
   - Version mismatches can force complete rebuilds
   - Stick to one Bevy version per project when possible

3. **Crate dependencies:**
   - Adding/removing dependencies triggers rebuilds
   - Changing feature flags triggers rebuilds
   - Plan dependency changes carefully
   - Batch dependency updates when possible

**Best practices:**
- Use `cargo check` for quick validation (no binary)
- Use `cargo build --features bevy/dynamic_linking` for testing
- Only use `cargo clean` when dealing with corrupted build artifacts
- Keep a stable `Cargo.lock` for consistent builds

## Domain-Driven Design for ECS

**Pure ECS structure demands careful data modeling.**

### Think Before You Code

Because it's hard to search a massive list of systems in one file, you must:

1. **Design the data model first:**
   - What entities exist in your domain?
   - What components do they need?
   - What behaviors (systems) operate on them?
   - How do components relate?

2. **Refer to docs and existing code:**
   - Check Bevy examples for similar patterns
   - Review the official docs for component design
   - Look at existing project code for consistency
   - Understand the domain before implementing

3. **Use bounded contexts:**
   - Group related components together
   - Create plugins per domain area
   - Keep systems focused on single responsibilities
   - Avoid cross-domain coupling

### Example Domain Modeling Process

**Bad approach:**
```
Start coding immediately
Add systems to one giant file
Discover missing components mid-implementation
Hard to navigate, hard to maintain
```

**Good approach:**
```
Define the domain (e.g., "Combat System")
List entities (Player, Enemy, Projectile)
List components (Health, Damage, Armor)
List events (DamageEvent, DeathEvent)
List systems (process_damage, check_death, spawn_projectile)
Check examples for similar implementations
Create CombatPlugin
Implement incrementally
Test at each step
```

### File Organization for Discoverability

```
src/
├── main.rs                      # App setup only
├── plugins/
│   ├── mod.rs
│   ├── combat.rs                # CombatPlugin
│   ├── movement.rs              # MovementPlugin
│   └── inventory.rs             # InventoryPlugin
├── components/
│   ├── mod.rs
│   ├── combat.rs                # Health, Armor, Damage
│   ├── movement.rs              # Velocity, Speed
│   └── inventory.rs             # Inventory, Item
└── events.rs                    # All game events
```

**Benefits:**
- Easy to find related code
- Clear domain boundaries
- Plugin-based modularity
- Searchable by feature/domain

## Version Management

**Bevy is under active development.**

1. **Check your Bevy version:**
   ```bash
   cargo tree | grep bevy
   ```

2. **Stay on one version per project:**
   - Avoid mixing Bevy versions
   - Update all Bevy crates together
   - Test thoroughly after version updates

3. **API changes between versions:**
   - Read the migration guide when updating
   - Bevy's API evolves rapidly
   - Code from older versions may not work
   - Examples are version-specific

4. **When seeking help:**
   - Always mention your Bevy version
   - Check if examples match your version
   - Look for version-specific documentation

## Summary Checklist

**Before implementing:**
- [ ] Check registry examples for similar features
- [ ] Design the data model (entities, components, events, systems)
- [ ] Create a plugin for the feature domain
- [ ] Review existing code for patterns

**During development:**
- [ ] Use `cargo build --features bevy/dynamic_linking`
- [ ] Avoid `cargo clean` unless necessary
- [ ] Test incrementally
- [ ] Keep systems focused and organized

**After implementation:**
- [ ] Verify the feature works
- [ ] Check for code organization issues
- [ ] Document domain-specific patterns
- [ ] Update plugin structure if needed
