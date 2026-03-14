# Bevy ECS Patterns Reference (0.18)

## Component Design Patterns

### Component Types

**1. Data Components**
Store game state, always derive `Component`:
```rust
#[derive(Component, Clone, Debug)]
pub struct BigFive {
    pub openness: f32,
    pub conscientiousness: f32,
    pub extraversion: f32,
    pub agreeableness: f32,
    pub neuroticism: f32,
}
```

**2. Marker Components**
Used for queries and categorization:
```rust
#[derive(Component)]
pub struct Player;

#[derive(Component)]
pub struct NPC;

#[derive(Component)]
pub struct Burning;  // Marker: entity is on fire
```

**3. Tag Components**
Temporary state or UI markers:
```rust
#[derive(Component)]
pub struct HoveredEntity;

#[derive(Component)]
pub struct InspectedEntity;
```

### Component Best Practices

**DO:**
- Keep components focused on single responsibility
- Use `Option<T>` for components that may not always be present
- Derive `Clone` for components that need to be copied
- Add helper methods via `impl` blocks
- Use archetypal patterns for common configurations

```rust
impl BigFive {
    pub fn temperature(&self) -> f32 {
        self.extraversion * 500.0 + 20.0
    }

    pub fn fire() -> Self {
        Self {
            openness: 0.8,
            conscientiousness: -0.7,
            extraversion: 0.9,
            agreeableness: -0.5,
            neuroticism: 0.7,
        }
    }
}
```

**DON'T:**
- Put logic in components
- Store references to other entities directly (use `Entity` IDs)
- Create deeply nested component hierarchies
- Use components as function parameters

## Query Patterns

**1. Basic Query**
```rust
fn system(query: Query<&ComponentA>) {
    for component in query.iter() {
        // Process each entity
    }
}
```

**2. Multi-Component Query**
```rust
fn system(query: Query<(&ComponentA, &ComponentB, &mut ComponentC)>) {
    for (a, b, mut c) in query.iter_mut() {
        // Read a, b; mutate c
    }
}
```

**3. Optional Components**
```rust
fn system(query: Query<(&Name, Option<&BigFive>)>) {
    for (name, maybe_traits) in query.iter() {
        if let Some(traits) = maybe_traits {
            // Has BigFive
        } else {
            // Doesn't have BigFive
        }
    }
}
```

**4. Filtered Query**
```rust
fn system(
    query: Query<(&BigFive, &Name), (With<Player>, Without<NPC>)>
) {
    // Only entities that have Player and don't have NPC
}
```

**5. Multiple Mutable Access**
```rust
fn system(
    mut query: Query<&mut BigFive>,
    events: EventReader<CastSpellEvent>,
) {
    for event in events.read() {
        if let Ok([mut source, mut target]) =
            query.get_many_mut([event.source, event.target])
        {
            // Can mutate both at once
        }
    }
}
```

### ArchetypeQueryData (New in 0.18)

Bevy 0.18 introduces `ArchetypeQueryData` to distinguish between archetypal and non-archetypal queries. If your code requires `ExactSizeIterator` from a query, use `ArchetypeQueryData` instead of `QueryData`:

```rust
// Bevy 0.17
fn requires_exact_size<D: QueryData>(q: Query<D>) -> usize {
    q.into_iter().len()
}

// Bevy 0.18
fn requires_exact_size<D: ArchetypeQueryData>(q: Query<D>) -> usize {
    q.into_iter().len()
}
```

Non-archetypal filters like `Changed<C>` filter based on change ticks, not just archetype membership. Manual `QueryData` implementations now need the `IS_ARCHETYPAL` associated constant.

## Common Design Patterns

### Derivation Pattern

**Problem:** Some properties should be calculated from others.

**Solution:**
```rust
// Source of truth
#[derive(Component)]
pub struct BigFive {
    pub extraversion: f32,
    // ...
}

impl BigFive {
    pub fn temperature(&self) -> f32 {
        self.extraversion * 500.0 + 20.0
    }
}

// Cached derived value
#[derive(Component)]
pub struct Temperature {
    pub degrees: f32,
}

// System to sync
pub fn derive_temperature(
    mut query: Query<(&BigFive, &mut Temperature), Changed<BigFive>>,
) {
    for (traits, mut temp) in query.iter_mut() {
        temp.degrees = traits.temperature();
    }
}
```

### State Machine Pattern

**Problem:** Entities need to change behavior based on state.

**Solution:**
```rust
#[derive(Component)]
pub enum NPCState {
    Idle,
    Patrolling,
    Investigating,
    Attacking,
}

pub fn npc_behavior(
    mut query: Query<(&mut Transform, &NPCState)>,
) {
    for (mut transform, state) in query.iter_mut() {
        match state {
            NPCState::Idle => { /* ... */ }
            NPCState::Patrolling => { /* ... */ }
            NPCState::Investigating => { /* ... */ }
            NPCState::Attacking => { /* ... */ }
        }
    }
}
```

### Threshold/Trigger Pattern

**Problem:** Need to detect when values cross boundaries.

**Solution:**
```rust
pub fn check_thresholds(
    mut query: Query<(Entity, &BigFive, &Name), Changed<BigFive>>,
    mut commands: Commands,
) {
    for (entity, traits, name) in query.iter() {
        // Check threshold
        if traits.extraversion > 0.6 {
            commands.entity(entity).insert(Burning {
                intensity: traits.extraversion,
            });
            println!("{} IGNITES!", name);
        }

        // Remove if below threshold
        if traits.extraversion <= 0.6 {
            commands.entity(entity).remove::<Burning>();
        }
    }
}
```

### Event-Driven Pattern (Observer Style)

**Problem:** Systems need to communicate without tight coupling.

**Solution (Bevy 0.18 observer pattern):**
```rust
// Define event
#[derive(Event, Clone)]
pub struct SpellCastEvent {
    pub caster: Entity,
    pub target: Entity,
    pub spell_type: SpellType,
}

// Observer handler
pub fn process_spell(
    trigger: Trigger<SpellCastEvent>,
    mut query: Query<&mut BigFive>,
) {
    let event = trigger.event();
    if let Ok(mut traits) = query.get_mut(event.target) {
        // Apply spell effect
    }
}

// Trigger from a system
pub fn cast_spell(
    input: Res<ButtonInput<KeyCode>>,
    mut commands: Commands,
) {
    if input.just_pressed(KeyCode::Space) {
        commands.trigger(SpellCastEvent { /* ... */ });
    }
}

// Register in plugin
app.add_observer(process_spell);
```

### Initialization Pattern

**Pattern: Initialize derived components**
```rust
// Entities spawned with BigFive but missing Temperature/Mass
pub fn initialize_derived_physics(
    mut commands: Commands,
    query: Query<(Entity, &BigFive), (Without<Temperature>, Without<Mass>)>,
) {
    for (entity, traits) in query.iter() {
        commands.entity(entity).insert((
            Temperature { degrees: traits.temperature() },
            Mass { kilograms: traits.mass() },
        ));
    }
}
```
