# Common Bevy 0.18 Pitfalls Reference

## 1. State Transitions Always Fire (New in 0.18)

**Problem:**
```rust
// In 0.17 this was a no-op if already in Menu state
// In 0.18 this ALWAYS triggers OnExit(Menu) then OnEnter(Menu)
next_state.set(GameState::Menu);
```

**Symptoms:**
- `OnEnter` systems running unexpectedly on repeated calls
- State initialization logic executing multiple times
- UI flickering or resetting when state is "re-entered"

**Solution:**
```rust
// Use set_if_neq to preserve 0.17 behavior
next_state.set_if_neq(GameState::Menu); // No-op if already Menu
```

## 2. RenderTarget as Camera Field (Changed in 0.18)

**Problem:**
```rust
// Bevy 0.17 pattern - no longer works
commands.spawn((
    Camera3d::default(),
    Camera {
        target: RenderTarget::Image(image_handle.into()),
        ..default()
    },
));
```

**Symptoms:**
- `no field 'target' on type Camera`
- Camera not rendering to expected target

**Solution:**
```rust
// Bevy 0.18 - RenderTarget is a separate component
commands.spawn((
    Camera3d::default(),
    RenderTarget::Image(image_handle.into()),
));
```

## 3. AmbientLight as Resource (Changed in 0.18)

**Problem:**
```rust
// Bevy 0.17 - AmbientLight was both resource and component
app.insert_resource(AmbientLight { color: Color::WHITE, brightness: 2000., ..default() });
```

**Symptoms:**
- Ambient light not behaving as expected globally
- Type mismatch errors

**Solution:**
```rust
// Bevy 0.18 - use GlobalAmbientLight for the resource
app.insert_resource(GlobalAmbientLight { color: Color::WHITE, brightness: 2000., ..default() });
```

## 4. Using Old Event System

**Problem:**
```rust
// Old event pattern doesn't work in 0.17+
#[derive(Event)]
struct MyEvent { data: String }

app.add_event::<MyEvent>()
   .add_systems(Update, handle_event);

fn handle_event(mut events: EventReader<MyEvent>) { /* ... */ }
fn trigger(mut events: EventWriter<MyEvent>) { /* ... */ }
```

**Symptoms:**
- Compilation error: `MyEvent is not a Message`
- `method 'send' not found for MessageWriter`
- `method 'read' not found for MessageReader`

**Solution:**
Migrate to the observer pattern:
```rust
#[derive(Event, Clone)]  // Must derive Clone!
struct MyEvent { data: String }

app.add_observer(handle_event);  // Use observer, not system

fn handle_event(
    trigger: Trigger<MyEvent>,  // Trigger parameter
    // ... other params
) {
    let event = trigger.event();
}

fn trigger_event(mut commands: Commands) {
    commands.trigger(MyEvent { data: "test".into() });
}
```

See `references/bevy_specific_tips.md` for complete migration guide.

## 5. Querying Material Handles

**Problem:**
```rust
// Old pattern doesn't work in 0.17+
Query<&Handle<StandardMaterial>>
```

**Symptoms:**
- `Handle<StandardMaterial> is not a Component`
- Query trait bounds not satisfied

**Solution:**
Use the `MeshMaterial3d` wrapper:
```rust
Query<&MeshMaterial3d<StandardMaterial>>

// Access handle with .0
for material_3d in query.iter() {
    if let Some(material) = materials.get_mut(&material_3d.0) {
        material.emissive = color;
    }
}
```

## 6. Forgetting to Register Systems

**Problem:**
```rust
// Created system but forgot to add to app
pub fn my_new_system() { /* ... */ }
```

**Solution:**
Always add to `main.rs` or plugin:
```rust
.add_systems(Update, my_new_system)
```

## 7. Borrowing Conflicts

**Problem:**
```rust
// Can't have multiple mutable borrows
mut query1: Query<&mut Transform>,
mut query2: Query<&mut Transform>,  // Error!
```

**Solution:**
```rust
// Use get_many_mut for specific entities
mut query: Query<&mut Transform>,

if let Ok([mut a, mut b]) = query.get_many_mut([entity_a, entity_b]) {
    // Can mutate both
}
```

## 8. Not Using Changed<T>

**Problem:**
```rust
// Runs every frame for every entity
fn system(query: Query<&BigFive>) {
    for traits in query.iter() {
        // Expensive calculation every frame
    }
}
```

**Solution:**
```rust
// Only runs when BigFive changes
fn system(query: Query<&BigFive, Changed<BigFive>>) {
    for traits in query.iter() {
        // Only when needed
    }
}
```

## 9. Entity Queries After Despawn

**Problem:**
```rust
commands.entity(entity).despawn();
// Later in same system
let component = query.get(entity).unwrap();  // Crash!
```

**Solution:**
Commands apply at end of stage. Use `Ok()` pattern:
```rust
if let Ok(component) = query.get(entity) {
    // Safe
}
```

## 10. Material/Asset Handle Confusion

**Problem:**
```rust
// Created material but didn't store handle
materials.add(StandardMaterial { .. });  // Handle dropped!
```

**Solution:**
```rust
let material_handle = materials.add(StandardMaterial { .. });
commands.spawn((
    MeshMaterial3d(material_handle),
    // ...
));
```

## 11. System Ordering Issues

**Problem:**
```rust
// UI updates before state changes
.add_systems(Update, (
    update_ui,
    process_input,  // Wrong order!
))
```

**Solution:**
Order systems by dependencies:
```rust
.add_systems(Update, (
    // Input processing
    process_input,

    // State changes
    update_state,

    // UI updates (reads state)
    update_ui,
))
```

## 12. Not Filtering Queries Early

**Problem:**
```rust
// Filter in loop (inefficient)
Query<(&A, Option<&B>, Option<&C>)>
// Then check in loop
```

**Solution:**
```rust
// Filter in query (efficient)
Query<&A, (With<B>, Without<C>)>
```

## 13. Commands::get_entity Behavior Change (New in 0.18)

**Problem:**
```rust
// In 0.18, get_entity no longer errors for non-spawned entities
let cmds = commands.get_entity(entity); // Succeeds even if entity only queued to spawn
```

**Symptoms:**
- Code that relied on `get_entity` failing for non-spawned entities now succeeds unexpectedly

**Solution:**
```rust
// Use get_spawned_entity if you specifically need spawned entities
let cmds = commands.get_spawned_entity(entity);
```

## 14. Internal Component References (Removed in 0.18)

**Problem:**
```rust
// Internal component no longer exists
Query<Entity, Without<Internal>>
```

**Symptoms:**
- `Internal` not found in scope
- Entity count tests failing

**Solution:**
Remove all `Internal` references. Query for specific components you care about instead of filtering out `Internal`.
