# 📡 Plant Sensor Monitoring (optional)

Notion Garden Care works without any hardware: watering, fertilizing and
pruning are planned from the intervals in your Notion database. If you own
plant sensors, you can **additionally** link them to a plant so that its real
condition is monitored.

> **Without linked sensors nothing changes.** Entities, states, attributes and
> the dashboard look exactly as before.

## Supported measurements

| Measurement | Typical sensor | Default range | Plant state when out of range |
|---|---|---|---|
| Soil moisture | MiFlora, ESPHome capacitive, Zigbee soil sensor | 20 – 60 % | `Needs Water` / `Too Wet` |
| Temperature | any temperature sensor | 5 – 35 °C | `Too Cold` / `Too Hot` |
| Illuminance | MiFlora, lux sensor | – (off) | `Too Dark` / `Too Bright` |
| Conductivity (fertility) | MiFlora | 350 – 2000 µS/cm | `Low Nutrients` / `Too Much Fertilizer` |
| Air humidity | any humidity sensor | – (off) | `Air Too Dry` / `Air Too Humid` |
| Sensor battery | battery entity of the sensor | min 15 % | `Sensor Battery Low` |

Any `sensor.*` entity with a numeric state can be used. Thresholds are
compared with the value **in the unit of the selected sensor**. Leave a
minimum or maximum empty to disable that check.

## Setup

1. **Settings → Devices & Services → Notion Garden Care → Configure**
2. **Plant sensors (optional)**
3. Select the plant (plants with sensors are marked with 📡)
4. Select the sensors you have, adjust the ranges, **Submit**

To unlink, open the same dialog and tick **Remove all sensors from this
plant** (or clear the sensor fields).

The configuration is stored in Home Assistant (config entry options), not in
Notion.

## How it works

### Watering

| Situation | Who decides "Needs Water"? |
|---|---|
| No moisture sensor linked | Notion schedule (`Next Water` ≤ today) – as before |
| Moisture sensor linked **with a minimum**, sensor available | The sensor: moisture < minimum |
| Moisture sensor linked but `unavailable`/`unknown` | Fallback to the Notion schedule |

`Needs Water` is the same state as before, so `sensor.plants_to_water`,
the blueprints and your automations keep working. Each entry in
`plants_to_water.attributes.plant_details` has a `source`
(`schedule` or `sensor`).

Marking a plant as watered still writes `Last Watered` to Notion, which keeps
your history and the schedule fallback up to date.

### Other measurements

Out-of-range values add states to the plant sensor, e.g.
`Needs Water, Too Hot`. `Too Dark` is only evaluated while the sun is up
(`sun.sun` = `above_horizon`), because light is naturally 0 at night.

### Entities and attributes

Plant sensors with linked sensors get two extra attributes:

```yaml
water_source: sensor          # or "schedule"
sensors:
  moisture:
    entity_id: sensor.basil_moisture
    value: 14.2
    unit: "%"
    status: low               # ok | low | high | unavailable
    min: 20
    max: 60
```

The plant sensor updates immediately whenever a linked sensor changes.

As soon as at least one plant has sensors, the integration also creates
`sensor.plants_needing_attention` (number of plants with any problem
reported by a sensor; details in the `plant_details` attribute).

### Dashboard

The plant card shows the readings as chips below the care schedule (red when
out of range, click opens the sensor) and a "📡 by sensor" badge on the water
row when the moisture sensor is in charge.

## Example automation

```yaml
triggers:
  - trigger: state
    entity_id: sensor.plants_needing_attention
conditions:
  - condition: numeric_state
    entity_id: sensor.plants_needing_attention
    above: 0
actions:
  - action: notify.mobile_app_phone
    data:
      title: "🌱 Plants need attention"
      message: >
        {% for p in state_attr('sensor.plants_needing_attention', 'plant_details') %}
        {{ p.name }}: {{ p.problems | join(', ') }}
        {% endfor %}
```
