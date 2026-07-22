/* Sentinel Grid ZekNova Adapter v2 */
(function (g) {
  'use strict';

  var AZL = g.AZL || (g.AZL = {});
  var V = {
    adapter: 2,
    environment: 1,
    stateSchema: 2,
    featureSpec: 2,
    actionSpace: 1,
    telemetry: 1
  };

  var PROD_DT = 6;
  var SESSION_TICKS = 180;
  var ALLOW_DEV_FALLBACK = g.AZL_ALLOW_ZEKNOVA_FALLBACK === true;
  var THREAT_GROWTH = {
    force: 2.2,
    negotiate: 0.4,
    share: -0.5,
    none: 0.6
  };

  function makeUtil() {
    function RNG(seed) {
      this.s = (seed >>> 0) || 1;
    }

    RNG.prototype.next = function () {
      var x = this.s;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.s = x >>> 0;
      return this.s / 4294967296;
    };

    RNG.prototype.int = function (n) {
      return Math.floor(this.next() * n);
    };

    RNG.prototype.state = function () {
      return this.s >>> 0;
    };

    return {
      RNG: RNG,
      clamp: function (v, a, b) {
        return Math.max(a, Math.min(b, Number(v) || 0));
      }
    };
  }

  var U = AZL.Util || makeUtil();
  var clamp = U.clamp;

  function num(v) {
    return Number.isFinite(Number(v)) ? Number(v) : 0;
  }

  function copyScalars(obj) {
    var out = {};

    if (!obj || typeof obj !== 'object') {
      return out;
    }

    Object.keys(obj)
      .sort()
      .forEach(function (key) {
        var value = obj[key];

        if (
          value === null ||
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          out[key] = value;
        }
      });

    return out;
  }

  var ACTIONS = [
    {
      key: 'mine_iron',
      label: 'Mine two iron formations'
    },
    {
      key: 'harvest_timber',
      label: 'Harvest three alien trees'
    },
    {
      key: 'recover_materials',
      label: 'Recover field materials'
    },
    {
      key: 'contain_threats',
      label: 'Contain nearby hostiles'
    },
    {
      key: 'stabilize_relations',
      label: 'Open a joint ZekNovan channel'
    },
    {
      key: 'build_power',
      label: 'Deploy a Solar Grid'
    },
    {
      key: 'build_water',
      label: 'Deploy connected Water Works'
    },
    {
      key: 'build_habitat',
      label: 'Open a connected Habitat'
    },
    {
      key: 'build_defense',
      label: 'Raise a Defense Beacon'
    },
    {
      key: 'build_research',
      label: 'Activate an AI Research Lab'
    },
    {
      key: 'build_culture',
      label: 'Establish a Creator Commons'
    },
    {
      key: 'build_governance',
      label: 'Commission a Civic Hall'
    },
    {
      key: 'build_crossing',
      label: 'Secure a river crossing'
    }
  ];

  var META = [
    {
      delta: {
        iron: 10,
        minerals: 4
      }
    },
    {
      delta: {
        timber: 30,
        credits: 3
      },
      ecology: -2.4
    },
    {
      delta: {
        minerals: 20,
        biomass: 12
      }
    },
    {
      minThreat: 0.0001,
      delta: {
        credits: 2,
        trust: -1
      },
      threat: -18
    },
    {
      minTension: 22,
      cost: {
        data: 5
      },
      delta: {
        trust: 8
      },
      tension: -12
    },
    {
      build: 'power',
      cost: {
        minerals: 24,
        iron: 8,
        biomass: 8,
        credits: 12
      },
      delta: {
        energy: 24
      }
    },
    {
      build: 'water',
      requires: {
        power: 1
      },
      cost: {
        minerals: 20,
        iron: 6,
        biomass: 12,
        credits: 10
      },
      delta: {
        water: 24
      },
      ecology: 3
    },
    {
      build: 'habitat',
      requires: {
        power: 1,
        water: 1
      },
      cost: {
        minerals: 28,
        iron: 10,
        biomass: 18,
        credits: 18
      }
    },
    {
      build: 'defense',
      requires: {
        power: 1
      },
      cost: {
        minerals: 34,
        iron: 14,
        energy: 10,
        credits: 20
      },
      threat: -8
    },
    {
      build: 'research',
      requires: {
        power: 1,
        water: 1
      },
      cost: {
        minerals: 32,
        iron: 12,
        energy: 8,
        credits: 24
      },
      delta: {
        data: 18
      }
    },
    {
      build: 'culture',
      requires: {
        power: 1,
        water: 1
      },
      cost: {
        minerals: 18,
        iron: 4,
        biomass: 20,
        credits: 16
      },
      delta: {
        trust: 5
      },
      ecology: 4
    },
    {
      build: 'governance',
      requires: {
        power: 1,
        water: 1,
        research: 1
      },
      cost: {
        minerals: 30,
        iron: 10,
        data: 12,
        credits: 28
      },
      delta: {
        trust: 4
      }
    },
    {
      build: 'bridge',
      cost: {
        minerals: 20,
        iron: 8,
        credits: 5
      }
    }
  ];

  var BUILD_KEYS = [
    'power',
    'water',
    'habitat',
    'research',
    'culture',
    'governance',
    'defense',
    'bridge',
    'boat'
  ];

  var AO_KEYS = [
    'forest',
    'desert',
    'highlands',
    'arctic',
    'wetlands'
  ];

  function normalizedSet(values, allowed, label) {
    var seen = Object.create(null);
    var allowedMap = Object.create(null);
    var result = [];

    (allowed || []).forEach(function (value) {
      allowedMap[value] = true;
    });

    (Array.isArray(values) ? values : []).forEach(function (raw) {
      var value = String(raw);

      if (!allowedMap[value]) {
        throw new Error('Unknown ' + label + ': ' + value);
      }

      if (!seen[value]) {
        seen[value] = true;
        result.push(value);
      }
    });

    result.sort();

    return result;
  }

  function missionBuildMatch(targets, buildKey) {
    return (
      targets.indexOf(buildKey) >= 0 ||
      (
        buildKey === 'bridge' &&
        targets.indexOf('boat') >= 0
      )
    );
  }

  function makeSpec() {
    var spec = [];

    function add(key, min, max, def) {
      spec.push({
        key: key,
        min: min,
        max: max,
        def: def
      });
    }

    [
      ['food_energy', 0, 300, 42],
      ['water', 0, 300, 38],
      ['minerals', 0, 400, 95],
      ['iron', 0, 120, 0],
      ['biomass', 0, 300, 72],
      ['timber', 0, 300, 0],
      ['data', 0, 200, 18],
      ['credits', 0, 150, 0],
      ['trust', 0, 100, 52],

      ['habitability', 0, 100, 12],
      ['ecology', 0, 100, 76],
      ['morale', 0, 100, 44],
      ['governance', 0, 100, 5],
      ['economy', 0, 100, 18],
      ['defense', 0, 100, 8],
      ['resilience', 0, 100, 14]
    ].forEach(function (x) {
      add(x[0], x[1], x[2], x[3]);
    });

    BUILD_KEYS.forEach(function (key) {
      add('b_' + key, 0, 4, 0);
    });

    [
      ['score', 0, 100, 8],
      ['phase', 1, 4, 1],
      ['threat', 0, 150, 0],
      ['tension', 0, 100, 50],
      ['missionProgress', 0, 100, 0],
      ['enemyCount', 0, 64, 0],
      ['specialGauge', 0, 100, 0],

      ['energyRate', -8, 12, 0],
      ['waterRate', -8, 12, 0],
      ['dataRate', 0, 8, 0],
      ['biomassRate', 0, 4, 0],

      ['threatRatio', 0, 6, 0],
      ['tensionPressure', 0, 1, 0],
      ['buildDiversity', 0, 9, 0],

      ['dip_none', 0, 1, 1],
      ['dip_share', 0, 1, 0],
      ['dip_negotiate', 0, 1, 0],
      ['dip_force', 0, 1, 0]
    ].forEach(function (x) {
      add(x[0], x[1], x[2], x[3]);
    });

    AO_KEYS.forEach(function (key) {
      add('ao_' + key, 0, 1, 0);
    });

    add('completedAOCount', 0, 5, 0);
    add('healthC', -1, 1, 0);

    while (spec.length < 56) {
      add('pad' + spec.length, 0, 1, 0);
    }

    BUILD_KEYS.forEach(function (key) {
      add('mt_' + key, 0, 1, 0);
    });

    add('officerBonus', 0.5, 2, 1);
    add('searchStep', 0, SESSION_TICKS, 0);
    add('missionComplete', 0, 1, 0);
    add('telemetryValid', 0, 1, 0);

    AO_KEYS.forEach(function (key) {
      add('completed_' + key, 0, 1, 0);
    });

    return spec;
  }

  var SPEC = makeSpec();
  var IDX = {};

  SPEC.forEach(function (feature, index) {
    IDX[feature.key] = index;
  });

  function stateFromContext(ctx) {
    ctx = ctx || {};

    var r = ctx.resources || {};
    var i = ctx.indicators || {};
    var b = ctx.buildings || {};
    var diplomacy = ctx.diplomacyOutcome || null;
    var enemyCount = Math.max(
      0,
      Math.floor(num(ctx.enemyCount))
    );

    var missionProgress = clamp(
      num(
        ctx.missionProgress != null
          ? ctx.missionProgress
          : ctx.mission && ctx.mission.progress
      ),
      0,
      100
    );

    var state = {
      t: Math.max(
        0,
        Math.floor(num(ctx.searchStep))
      ),

      seed: (ctx.seed >>> 0) || 0,

      telemetryValid: ctx.telemetryValid === true,

      officerBonus: ctx.officerBonus != null
        ? num(ctx.officerBonus)
        : ctx.officerClass === 'captain'
          ? 1.1
          : 1,

      resources: {
        energy: r.energy != null ? num(r.energy) : 42,
        water: r.water != null ? num(r.water) : 38,
        minerals: r.minerals != null ? num(r.minerals) : 95,
        iron: num(r.iron),
        biomass: r.biomass != null ? num(r.biomass) : 72,
        timber: num(r.timber),
        data: r.data != null ? num(r.data) : 18,
        credits: num(r.credits),
        trust: r.trust != null ? num(r.trust) : 52
      },

      indicators: {
        habitability: i.habitability != null
          ? num(i.habitability)
          : 12,

        ecology: i.ecology != null
          ? num(i.ecology)
          : 76,

        morale: i.morale != null
          ? num(i.morale)
          : 44,

        governance: i.governance != null
          ? num(i.governance)
          : 5,

        economy: i.economy != null
          ? num(i.economy)
          : 18,

        defense: i.defense != null
          ? num(i.defense)
          : 8,

        resilience: i.resilience != null
          ? num(i.resilience)
          : 14
      },

      buildings: {},

      score: ctx.score != null
        ? num(ctx.score)
        : 8,

      phase: Math.max(
        1,
        num(ctx.phase) || 1
      ),

      threat: clamp(
        ctx.threat != null
          ? num(ctx.threat)
          : enemyCount * 8 +
            (diplomacy === 'force' ? 34 : 0),
        0,
        150
      ),

      tension: clamp(
        ctx.diplomacyTension != null
          ? num(ctx.diplomacyTension)
          : diplomacy === 'force'
            ? 85
            : diplomacy === 'share'
              ? 20
              : diplomacy === 'negotiate'
                ? 35
                : 50,
        0,
        100
      ),

      missionProgress: missionProgress,

      missionTargets: normalizedSet(
        Array.isArray(ctx.missionTargets)
          ? ctx.missionTargets
          : ctx.mission && ctx.mission.targetTypes,
        BUILD_KEYS,
        'mission target'
      ),

      missionComplete: ctx.missionComplete != null
        ? Boolean(ctx.missionComplete)
        : missionProgress >= 100,

      enemyCount: enemyCount,

      specialGauge: num(ctx.specialGauge),

      diplomacyOutcome: diplomacy,

      currentAO: ctx.currentAO || null,

      completedAOs: normalizedSet(
        ctx.completedAOs,
        AO_KEYS,
        'completed AO'
      ),

      activeModifiers: copyScalars(
        ctx.activeModifiers
      )
    };

    if (
      state.currentAO &&
      AO_KEYS.indexOf(state.currentAO) < 0
    ) {
      throw new Error(
        'Unknown current AO: ' + state.currentAO
      );
    }

    BUILD_KEYS.forEach(function (key) {
      state.buildings[key] = num(b[key]);
    });

    return state;
  }

  function init(seed) {
    return stateFromContext({
      seed: seed,
      searchStep: 0,
      telemetryValid: false
    });
  }

  function clone(s) {
    return {
      t: s.t,
      seed: s.seed,
      telemetryValid: s.telemetryValid,
      officerBonus: s.officerBonus,

      resources: Object.assign(
        {},
        s.resources
      ),

      indicators: Object.assign(
        {},
        s.indicators
      ),

      buildings: Object.assign(
        {},
        s.buildings
      ),

      score: s.score,
      phase: s.phase,
      threat: s.threat,
      tension: s.tension,

      missionProgress: s.missionProgress,
      missionTargets: s.missionTargets.slice(),
      missionComplete: s.missionComplete,

      enemyCount: s.enemyCount,
      specialGauge: s.specialGauge,

      diplomacyOutcome: s.diplomacyOutcome,
      currentAO: s.currentAO,
      completedAOs: s.completedAOs.slice(),

      activeModifiers: copyScalars(
        s.activeModifiers
      )
    };
  }

  function canAfford(s, cost) {
    if (!cost) {
      return true;
    }

    return Object.keys(cost).every(function (key) {
      return num(s.resources[key]) >= num(cost[key]);
    });
  }

  function isLegal(s, action) {
    if (
      !Number.isInteger(action) ||
      action < 0 ||
      action >= ACTIONS.length
    ) {
      return false;
    }

    var m = META[action];

    if (!canAfford(s, m.cost)) {
      return false;
    }

    if (
      m.requires &&
      !Object.keys(m.requires).every(function (key) {
        return (
          num(s.buildings[key]) >=
          num(m.requires[key])
        );
      })
    ) {
      return false;
    }

    if (
      m.minThreat != null &&
      !(s.threat > 0)
    ) {
      return false;
    }

    if (
      m.minTension != null &&
      !(s.tension > m.minTension)
    ) {
      return false;
    }

    if (
      m.build &&
      num(s.buildings[m.build]) >= 4
    ) {
      return false;
    }

    return true;
  }

  function legalMask(s, out) {
    if (
      !out ||
      typeof out.length !== 'number'
    ) {
      throw new TypeError(
        'legalMask requires an output array.'
      );
    }

    for (
      var action = 0;
      action < ACTIONS.length;
      action++
    ) {
      out[action] = isLegal(s, action)
        ? 1
        : 0;
    }

    for (
      var extra = ACTIONS.length;
      extra < out.length;
      extra++
    ) {
      out[extra] = 0;
    }

    out[2] = 1;
  }

  function recompute(s) {
    var b = s.buildings;
    var r = s.resources;
    var i = s.indicators;
    var bonus = s.officerBonus;

    var mobility = Math.min(
      12,
      b.bridge * 3 +
      b.boat * 6
    );

    r.energy = clamp(
      r.energy +
      (
        b.power * 1.6 -
        (b.habitat + b.research) * 0.45
      ) *
      PROD_DT *
      bonus,
      0,
      999
    );

    r.water = clamp(
      r.water +
      (
        b.water * 1.5 -
        b.habitat * 0.38
      ) *
      PROD_DT *
      bonus,
      0,
      999
    );

    r.data = clamp(
      r.data +
      b.research *
      0.55 *
      PROD_DT *
      bonus,
      0,
      999
    );

    r.biomass = clamp(
      r.biomass +
      Math.max(
        0,
        i.ecology - 45
      ) *
      0.002 *
      PROD_DT,
      0,
      999
    );

    i.habitability = clamp(
      8 +
      b.habitat * 12 +
      b.water * 6 +
      b.power * 5 +
      mobility +
      (
        r.energy > 2 &&
        r.water > 2
          ? 8
          : -10
      ),
      0,
      100
    );

    i.morale = clamp(
      24 +
      b.habitat * 7 +
      b.culture * 12 +
      r.trust * 0.2 +
      mobility * 0.35,
      0,
      100
    );

    i.governance = clamp(
      5 +
      b.governance * 21 +
      b.research * 3,
      0,
      100
    );

    i.economy = clamp(
      12 +
      b.habitat * 5 +
      b.research * 8 +
      b.governance * 7 +
      b.bridge * 2 +
      b.boat * 5,
      0,
      100
    );

    i.defense = clamp(
      5 +
      b.defense * 22 +
      b.power * 2,
      0,
      100
    );

    i.resilience = clamp(
      (
        i.habitability +
        i.ecology +
        i.governance +
        i.defense
      ) / 4,
      0,
      100
    );

    var values = [
      i.habitability,
      i.ecology,
      i.morale,
      i.governance,
      i.economy,
      i.defense,
      i.resilience,
      r.trust
    ];

    var min = Math.min.apply(
      null,
      values
    );

    var max = Math.max.apply(
      null,
      values
    );

    var sum = values.reduce(
      function (total, value) {
        return total + value;
      },
      0
    );

    var diversity = BUILD_KEYS.reduce(
      function (total, key) {
        return total + (
          b[key] > 0
            ? 1
            : 0
        );
      },
      0
    );

    s.score = clamp(
      sum / values.length +
      diversity * 2.5 -
      (max - min) * 0.12,
      0,
      100
    );

    s.phase = s.score >= 72
      ? 4
      : s.score >= 48
        ? 3
        : s.score >= 24
          ? 2
          : 1;
  }

  function step(s, action, rng) {
    if (
      !Number.isInteger(action) ||
      action < 0 ||
      action >= ACTIONS.length
    ) {
      throw new RangeError(
        'Invalid action index: ' + action
      );
    }

    if (!isLegal(s, action)) {
      throw new Error(
        'Illegal action "' +
        ACTIONS[action].key +
        '".'
      );
    }

    if (
      !rng ||
      typeof rng.next !== 'function'
    ) {
      throw new Error(
        'A deterministic RNG with next() is required.'
      );
    }

    var m = META[action];

    var noise = function (scale) {
      return (
        rng.next() - 0.5
      ) * scale;
    };

    Object.keys(
      m.cost || {}
    ).forEach(function (key) {
      s.resources[key] = Math.max(
        0,
        num(s.resources[key]) -
        num(m.cost[key])
      );
    });

    Object.keys(
      m.delta || {}
    ).forEach(function (key) {
      s.resources[key] = clamp(
        num(s.resources[key]) +
        num(m.delta[key]),
        0,
        key === 'trust'
          ? 100
          : 9999
      );
    });

    if (m.ecology) {
      s.indicators.ecology = clamp(
        s.indicators.ecology +
        m.ecology,
        0,
        100
      );
    }

    if (m.build) {
      s.buildings[m.build] =
        num(s.buildings[m.build]) + 1;

      s.missionProgress = clamp(
        s.missionProgress +
        (
          missionBuildMatch(
            s.missionTargets,
            m.build
          )
            ? 14
            : 5
        ),
        0,
        100
      );

      if (s.missionProgress >= 100) {
        s.missionComplete = true;
      }
    }

    recompute(s);

    s.threat = clamp(
      s.threat +
      num(m.threat) +
      THREAT_GROWTH[
        s.diplomacyOutcome || 'none'
      ] +
      noise(0.6),
      0,
      150
    );

    s.tension = clamp(
      s.tension +
      num(m.tension) +
      (
        s.diplomacyOutcome === 'force'
          ? 0.5
          : 0
      ) +
      noise(0.3),
      0,
      100
    );

    if (
      s.threat >
      s.indicators.defense + 40
    ) {
      s.indicators.morale = clamp(
        s.indicators.morale - 2,
        0,
        100
      );

      s.threat *= 0.85;
    }

    s.enemyCount = Math.max(
      0,
      Math.round(
        (
          s.threat -
          (
            s.diplomacyOutcome === 'force'
              ? 34
              : 0
          )
        ) / 8
      )
    );

    s.t++;

    var diversity = BUILD_KEYS.reduce(
      function (total, key) {
        return total + (
          s.buildings[key] > 0
            ? 1
            : 0
        );
      },
      0
    );

    if (
      s.phase >= 4 &&
      s.score >= 90 &&
      diversity >= 6
    ) {
      return {
        terminal: true,
        terminalValue: 1
      };
    }

    if (
      s.t > 12 &&
      s.score <= 8 &&
      s.diplomacyOutcome === 'force' &&
      s.buildings.defense === 0 &&
      s.threat > 50
    ) {
      return {
        terminal: true,
        terminalValue: -1
      };
    }

    if (s.t >= SESSION_TICKS) {
      return {
        terminal: true,
        terminalValue: health(s)
      };
    }

    return {
      terminal: false,
      terminalValue: 0
    };
  }

  function health(s) {
    return clamp(
      (
        s.score / 50
      ) -
      1 +
      (
        s.missionProgress / 100
      ) *
      0.20 -
      Math.min(
        s.threat / 100,
        1
      ) *
      0.40 -
      Math.max(
        0,
        s.tension - 50
      ) /
      50 *
      0.20 +
      (
        s.resources.trust - 50
      ) /
      50 *
      0.10,
      -1,
      1
    );
  }

  function evaluate(s) {
    var i = s.indicators;
    var r = s.resources;

    var values = [
      i.habitability,
      i.ecology,
      i.morale,
      i.governance,
      i.economy,
      i.defense,
      i.resilience
    ];

    var average = values.reduce(
      function (sum, value) {
        return sum + value;
      },
      0
    ) / values.length;

    var weakest = Math.min.apply(
      null,
      values
    );

    var diversity = BUILD_KEYS.reduce(
      function (sum, key) {
        return sum + (
          s.buildings[key] > 0
            ? 1
            : 0
        );
      },
      0
    );

    var resources =
      Math.min(r.iron / 18, 1) * 5 +
      Math.min(r.credits / 28, 1) * 5 +
      Math.min(r.minerals / 55, 1) * 3 +
      Math.min(r.energy / 45, 1) * 2 +
      Math.min(r.water / 45, 1) * 2 +
      Math.min(r.timber / 35, 1) * 1.5;

    return (
      average * 0.58 +
      weakest * 0.2 +
      diversity * 2.5 +
      resources +
      (r.trust - 40) * 0.12 +
      s.missionProgress * 0.24 -
      s.threat * 0.32 -
      Math.max(
        0,
        s.tension - 45
      ) *
      0.13
    );
  }

  function heuristicValue(s) {
    return clamp(
      Math.tanh(
        (
          evaluate(s) - 40
        ) / 40
      ),
      -1,
      1
    );
  }

  function actionScores(s, out) {
    if (
      !out ||
      typeof out.fill !== 'function'
    ) {
      throw new TypeError(
        'actionScores requires a typed output array.'
      );
    }

    out.fill(0);

    var r = s.resources;
    var b = s.buildings;
    var i = s.indicators;

    out[0] = r.iron < 8
      ? 1
      : r.iron < 18
        ? 0.4
        : -0.2;

    out[1] = r.credits < 12
      ? 0.8
      : 0.1;

    out[2] = (
      r.minerals < 40 ||
      r.biomass < 30
    )
      ? 0.7
      : 0.2;

    out[3] = s.threat > 0
      ? clamp(
          s.threat / 40,
          0,
          1
        )
      : -1;

    out[4] = s.tension > 45
      ? 0.8
      : s.tension > 22
        ? 0.3
        : -1;

    out[5] = b.power < 1
      ? 1
      : b.power < 2
        ? 0.3
        : -0.2;

    out[6] = (
      b.power >= 1 &&
      b.water < 1
    )
      ? 0.9
      : -0.2;

    out[7] = (
      b.power >= 1 &&
      b.water >= 1 &&
      b.habitat < 2
    )
      ? 0.8
      : -0.2;

    out[8] = (
      s.threat >
      5 + b.defense * 22
    )
      ? 0.8
      : b.defense < 1
        ? 0.3
        : -0.1;

    out[9] = (
      b.power >= 1 &&
      b.water >= 1 &&
      b.research < 1
    )
      ? 0.7
      : -0.1;

    out[10] = (
      b.power >= 1 &&
      b.water >= 1 &&
      i.morale < 40
    )
      ? 0.6
      : 0;

    out[11] = (
      b.research >= 1 &&
      i.governance < 40
    )
      ? 0.6
      : -0.1;

    out[12] = b.bridge < 1
      ? 0.3
      : -0.3;
  }

  function toBaseFeatures(s, out) {
    if (
      !out ||
      out.length < SPEC.length
    ) {
      throw new RangeError(
        'Feature output must have length >= ' +
        SPEC.length +
        '.'
      );
    }

    var r = s.resources;
    var i = s.indicators;
    var b = s.buildings;
    var bonus = s.officerBonus;

    [
      ['food_energy', r.energy],
      ['water', r.water],
      ['minerals', r.minerals],
      ['iron', r.iron],
      ['biomass', r.biomass],
      ['timber', r.timber],
      ['data', r.data],
      ['credits', r.credits],
      ['trust', r.trust],

      ['habitability', i.habitability],
      ['ecology', i.ecology],
      ['morale', i.morale],
      ['governance', i.governance],
      ['economy', i.economy],
      ['defense', i.defense],
      ['resilience', i.resilience]
    ].forEach(function (pair) {
      out[IDX[pair[0]]] = pair[1];
    });

    BUILD_KEYS.forEach(function (key) {
      out[IDX['b_' + key]] = b[key];
    });

    out[IDX.score] = s.score;
    out[IDX.phase] = s.phase;
    out[IDX.threat] = s.threat;
    out[IDX.tension] = s.tension;
    out[IDX.missionProgress] = s.missionProgress;
    out[IDX.enemyCount] = s.enemyCount;
    out[IDX.specialGauge] = s.specialGauge;

    out[IDX.energyRate] = (
      b.power * 1.6 -
      (
        b.habitat +
        b.research
      ) *
      0.45
    ) * bonus;

    out[IDX.waterRate] = (
      b.water * 1.5 -
      b.habitat * 0.38
    ) * bonus;

    out[IDX.dataRate] =
      b.research *
      0.55 *
      bonus;

    out[IDX.biomassRate] =
      Math.max(
        0,
        i.ecology - 45
      ) *
      0.002;

    out[IDX.threatRatio] =
      i.defense > 0
        ? s.threat / i.defense
        : 5;

    out[IDX.tensionPressure] =
      Math.max(
        0,
        s.tension - 50
      ) /
      50;

    out[IDX.buildDiversity] =
      BUILD_KEYS.reduce(
        function (sum, key) {
          return sum + (
            b[key] > 0
              ? 1
              : 0
          );
        },
        0
      );

    out[IDX.dip_none] =
      s.diplomacyOutcome
        ? 0
        : 1;

    out[IDX.dip_share] =
      s.diplomacyOutcome === 'share'
        ? 1
        : 0;

    out[IDX.dip_negotiate] =
      s.diplomacyOutcome === 'negotiate'
        ? 1
        : 0;

    out[IDX.dip_force] =
      s.diplomacyOutcome === 'force'
        ? 1
        : 0;

    AO_KEYS.forEach(function (key) {
      out[IDX['ao_' + key]] =
        s.currentAO === key
          ? 1
          : 0;
    });

    out[IDX.completedAOCount] =
      s.completedAOs.length;

    out[IDX.healthC] =
      health(s);

    for (
      var pad = 50;
      pad < 56;
      pad++
    ) {
      out[pad] = 0;
    }

    BUILD_KEYS.forEach(function (key) {
      out[IDX['mt_' + key]] =
        s.missionTargets.indexOf(key) >= 0
          ? 1
          : 0;
    });

    out[IDX.officerBonus] =
      s.officerBonus;

    out[IDX.searchStep] =
      s.t;

    out[IDX.missionComplete] =
      s.missionComplete
        ? 1
        : 0;

    out[IDX.telemetryValid] =
      s.telemetryValid
        ? 1
        : 0;

    AO_KEYS.forEach(function (key) {
      out[IDX['completed_' + key]] =
        s.completedAOs.indexOf(key) >= 0
          ? 1
          : 0;
    });

    for (
      var extra = SPEC.length;
      extra < out.length;
      extra++
    ) {
      out[extra] = 0;
    }
  }

  function entities(s) {
    var result = [
      {
        id: 'colony',
        type: 'core',
        x: 0,
        y: 0,
        threat: clamp(
          (
            s.threat -
            s.indicators.defense
          ) / 60,
          0,
          1
        ),
        hostile: false,
        critical: true,
        deps: []
      }
    ];

    AO_KEYS.forEach(function (key, index) {
      var completed =
        s.completedAOs.indexOf(key) >= 0;

      var current =
        s.currentAO === key;

      result.push({
        id: 'ao_' + key,
        type: 'region',
        x: (index + 1) * 6,
        y: 0,
        threat: clamp(
          s.threat / 100,
          0,
          1
        ),
        hostile: false,
        critical: current,
        deps: completed || current
          ? ['colony']
          : []
      });
    });

    for (
      var hostile = 0;
      hostile < Math.min(
        s.enemyCount,
        6
      );
      hostile++
    ) {
      result.push({
        id: 'hostile_' + hostile,
        type: 'hostile',
        x: 3 + hostile * 4,
        y: 3,
        threat: clamp(
          s.threat / 100,
          0.1,
          1
        ),
        hostile: true,
        critical: false,
        deps: []
      });
    }

    return result;
  }

  function transitionIdentity(s) {
    return {
      schemaVersion: V.stateSchema,
      t: s.t,
      officerBonus: s.officerBonus,

      resources: copyScalars(
        s.resources
      ),

      indicators: copyScalars(
        s.indicators
      ),

      buildings: copyScalars(
        s.buildings
      ),

      score: s.score,
      phase: s.phase,
      threat: s.threat,
      tension: s.tension,

      missionProgress: s.missionProgress,
      missionTargets: s.missionTargets.slice(),
      missionComplete: s.missionComplete,

      enemyCount: s.enemyCount,
      specialGauge: s.specialGauge,

      diplomacyOutcome: s.diplomacyOutcome,
      currentAO: s.currentAO,
      completedAOs: s.completedAOs.slice(),

      activeModifiers: copyScalars(
        s.activeModifiers
      )
    };
  }

  function captureSearchState() {
    var game =
      g.ZekNovaGame ||
      (
        g.window &&
        g.window.ZekNovaGame
      ) ||
      null;

    if (
      !game ||
      !game.simulation ||
      !game.buildings
    ) {
      if (ALLOW_DEV_FALLBACK) {
        return init(0);
      }

      throw new Error(
        'ZekNova live game state is unavailable.'
      );
    }

    if (
      typeof game.getAdvisorTelemetry !==
      'function'
    ) {
      if (ALLOW_DEV_FALLBACK) {
        return init(0);
      }

      throw new Error(
        'ZekNova getAdvisorTelemetry() is required.'
      );
    }

    var telemetry;

    try {
      telemetry =
        game.getAdvisorTelemetry();
    } catch (error) {
      throw new Error(
        'ZekNova telemetry capture failed: ' +
        String(
          error &&
          error.message ||
          error
        )
      );
    }

    if (
      !telemetry ||
      typeof telemetry !== 'object'
    ) {
      throw new Error(
        'ZekNova telemetry returned no payload.'
      );
    }

    if (
      telemetry.version !==
      V.telemetry
    ) {
      throw new Error(
        'Unsupported ZekNova telemetry version ' +
        telemetry.version +
        '; expected ' +
        V.telemetry +
        '.'
      );
    }

    telemetry.telemetryValid = true;
    telemetry.searchStep = 0;

    return stateFromContext(telemetry);
  }

  var adapter = {
    id: 'zeknova',
    version: V.adapter,

    environmentVersion: V.environment,
    stateSchemaVersion: V.stateSchema,
    featureSpecVersion: V.featureSpec,
    actionSpaceVersion: V.actionSpace,
    telemetryVersion: V.telemetry,

    featureCount: SPEC.length,
    safeActionIndex: 2,
    isReferenceSimulator: false,

    actions: ACTIONS,
    baseFeatureSpec: SPEC,

    oracleGroups: {
      resources: [
        IDX.food_energy,
        IDX.water,
        IDX.minerals,
        IDX.iron,
        IDX.biomass,
        IDX.timber,
        IDX.data,
        IDX.credits,
        IDX.energyRate,
        IDX.waterRate
      ],

      threat: [
        IDX.threat,
        IDX.tension,
        IDX.enemyCount,
        IDX.threatRatio,
        IDX.defense
      ],

      population: [
        IDX.habitability,
        IDX.morale,
        IDX.ecology
      ],

      construction: [
        IDX.b_power,
        IDX.b_water,
        IDX.b_habitat,
        IDX.b_research,
        IDX.b_culture,
        IDX.b_governance,
        IDX.b_defense,
        IDX.b_bridge,
        IDX.b_boat,
        IDX.missionProgress,
        IDX.economy,
        IDX.buildDiversity
      ],

      mobility: [
        IDX.b_bridge,
        IDX.b_boat,
        IDX.completedAOCount
      ],

      health: [
        IDX.healthC,
        IDX.score,
        IDX.resilience
      ]
    },

    relational: {
      distThresh: 7,
      causalDependencies: false
    },

    relationalActionBias: function (_aux, out) {
      out.fill(0);
    },

    captureSearchState: captureSearchState,
    captureTransitionIdentity: transitionIdentity,

    getActionDuration: function () {
      return PROD_DT;
    },

    sim: {
      init: init,
      clone: clone,
      step: step,
      legalMask: legalMask,
      toBaseFeatures: toBaseFeatures,
      heuristicValue: heuristicValue,
      actionScores: actionScores,
      entities: entities,
      health: health,

      tick: function (s) {
        return s.t;
      },

      transitionIdentity: transitionIdentity
    }
  };

  g.AZL_ADAPTER = adapter;
  AZL.ZekNovaAdapter = adapter;
})(
  typeof self !== 'undefined'
    ? self
    : globalThis
);