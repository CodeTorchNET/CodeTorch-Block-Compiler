export default [
  // --- MOTION ---
  {
    id: "motion_movesteps",
    spec: "move %1 steps",
    inputs: ["%n"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        { name: "STEPS", shadow: "math_number", field: "NUM", default: "10" },
      ],
    },
  },
  {
    id: "motion_turnright",
    spec: "turn right %1 degrees",
    inputs: ["%n"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        { name: "DEGREES", shadow: "math_number", field: "NUM", default: "15" },
      ],
    },
  },
  {
    id: "motion_turnleft",
    spec: "turn left %1 degrees",
    inputs: ["%n"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        { name: "DEGREES", shadow: "math_number", field: "NUM", default: "15" },
      ],
    },
  },
  {
    id: "motion_goto",
    spec: "go to %1",
    inputs: ["%m.goto"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "TO",
          shadow: "motion_goto_menu",
          field: "TO",
          default: "_mouse_",
        },
      ],
    },
  },
  {
    id: "motion_gotoxy",
    spec: "go to x:%1 y:%2",
    inputs: ["%n", "%n"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        { name: "X", shadow: "math_number", field: "NUM", default: "0" },
        { name: "Y", shadow: "math_number", field: "NUM", default: "0" },
      ],
    },
  },
  {
    id: "motion_glideto",
    spec: "glide %1 secs to %2",
    inputs: ["%n", "%m.glideto"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        { name: "SECS", shadow: "math_number", field: "NUM", default: "1" },
        {
          name: "TO",
          shadow: "motion_glideto_menu",
          field: "TO",
          default: "_mouse_",
        },
      ],
    },
  },
  {
    id: "motion_glidesecstoxy",
    spec: "glide %1 secs to x:%2 y:%3",
    inputs: ["%n", "%n", "%n"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        { name: "SECS", shadow: "math_number", field: "NUM", default: "1" },
        { name: "X", shadow: "math_number", field: "NUM", default: "0" },
        { name: "Y", shadow: "math_number", field: "NUM", default: "0" },
      ],
    },
  },
  {
    id: "motion_pointindirection",
    spec: "point in direction %1",
    inputs: ["%d.direction"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "DIRECTION",
          shadow: "math_angle",
          field: "NUM",
          default: "90",
        },
      ],
    },
  },
  {
    id: "motion_pointtowards",
    spec: "point towards %1",
    inputs: ["%m.pointTowards"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "TOWARDS",
          shadow: "motion_pointtowards_menu",
          field: "TOWARDS",
          default: "_mouse_",
        },
      ],
    },
  },
  {
    id: "motion_changexby",
    spec: "change x by %1",
    inputs: ["%n"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        { name: "DX", shadow: "math_number", field: "NUM", default: "10" },
      ],
    },
  },
  {
    id: "motion_setx",
    spec: "set x to %1",
    inputs: ["%n"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [{ name: "X", shadow: "math_number", field: "NUM", default: "0" }],
    },
  },
  {
    id: "motion_changeyby",
    spec: "change y by %1",
    inputs: ["%n"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        { name: "DY", shadow: "math_number", field: "NUM", default: "10" },
      ],
    },
  },
  {
    id: "motion_sety",
    spec: "set y to %1",
    inputs: ["%n"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [{ name: "Y", shadow: "math_number", field: "NUM", default: "0" }],
    },
  },
  {
    id: "motion_ifonedgebounce",
    spec: "if on edge, bounce",
    inputs: [],
    shape: "stack",
    category: "motion",
    xml: { args: [] },
  },
  {
    id: "motion_setrotationstyle",
    spec: "set rotation style %1",
    inputs: ["%d.rotationStyle"],
    shape: "stack",
    category: "motion",
    xml: {
      args: [{ name: "STYLE", type: "field", default: "left-right" }],
    },
  },
  {
    id: "motion_xposition",
    spec: "x position",
    inputs: [],
    shape: "reporter",
    category: "motion",
    xml: { args: [] },
  },
  {
    id: "motion_yposition",
    spec: "y position",
    inputs: [],
    shape: "reporter",
    category: "motion",
    xml: { args: [] },
  },
  {
    id: "motion_direction",
    spec: "direction",
    inputs: [],
    shape: "reporter",
    category: "motion",
    xml: { args: [] },
  },
  // --- LOOKS ---
  {
    id: "looks_sayforsecs",
    spec: "say %1 for %2 seconds",
    inputs: ["%s", "%n"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        { name: "MESSAGE", shadow: "text", field: "TEXT", default: "Hello!" },
        { name: "SECS", shadow: "math_number", field: "NUM", default: "2" },
      ],
    },
  },
  {
    id: "looks_say",
    spec: "say %1",
    inputs: ["%s"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        { name: "MESSAGE", shadow: "text", field: "TEXT", default: "Hello!" },
      ],
    },
  },
  {
    id: "looks_thinkforsecs",
    spec: "think %1 for %2 seconds",
    inputs: ["%s", "%n"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        { name: "MESSAGE", shadow: "text", field: "TEXT", default: "Hmm..." },
        { name: "SECS", shadow: "math_number", field: "NUM", default: "2" },
      ],
    },
  },
  {
    id: "looks_think",
    spec: "think %1",
    inputs: ["%s"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        { name: "MESSAGE", shadow: "text", field: "TEXT", default: "Hmm..." },
      ],
    },
  },
  {
    id: "looks_show",
    spec: "show",
    inputs: [],
    shape: "stack",
    category: "looks",
    xml: { args: [] },
  },
  {
    id: "looks_hide",
    spec: "hide",
    inputs: [],
    shape: "stack",
    category: "looks",
    xml: { args: [] },
  },
  {
    id: "looks_switchcostumeto",
    spec: "switch costume to %1",
    inputs: ["%s"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "COSTUME",
          shadow: "looks_costume",
          field: "COSTUME",
          default: "costume1",
        },
      ],
    },
  },
  {
    id: "looks_nextcostume",
    spec: "next costume",
    inputs: [],
    shape: "stack",
    category: "looks",
    xml: { args: [] },
  },
  {
    id: "looks_nextbackdrop",
    spec: "next backdrop",
    inputs: [],
    shape: "stack",
    category: "looks",
    xml: { args: [] },
  },
  {
    id: "looks_switchbackdropto",
    spec: "switch backdrop to %1",
    inputs: ["%s"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "BACKDROP",
          shadow: "looks_backdrops",
          field: "BACKDROP",
          default: "backdrop1",
        },
      ],
    },
  },
  {
    id: "looks_switchbackdroptoandwait",
    spec: "switch backdrop to %1 and wait",
    inputs: ["%s"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "BACKDROP",
          shadow: "looks_backdrops",
          field: "BACKDROP",
          default: "backdrop1",
        },
      ],
    },
  },
  {
    id: "looks_changeeffectby",
    spec: "change %1 effect by %2",
    inputs: ["%m.effect", "%n"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        { name: "EFFECT", type: "field", default: "color" },
        { name: "CHANGE", shadow: "math_number", field: "NUM", default: "25" },
      ],
    },
  },
  {
    id: "looks_seteffectto",
    spec: "set %1 effect to %2",
    inputs: ["%m.effect", "%n"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        { name: "EFFECT", type: "field", default: "color" },
        { name: "VALUE", shadow: "math_number", field: "NUM", default: "0" },
      ],
    },
  },
  {
    id: "looks_cleargraphiceffects",
    spec: "clear graphic effects",
    inputs: [],
    shape: "stack",
    category: "looks",
    xml: { args: [] },
  },
  {
    id: "looks_changesizeby",
    spec: "change size by %1",
    inputs: ["%n"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        { name: "CHANGE", shadow: "math_number", field: "NUM", default: "10" },
      ],
    },
  },
  {
    id: "looks_setsizeto",
    spec: "set size to %1 %",
    inputs: ["%n"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        { name: "SIZE", shadow: "math_number", field: "NUM", default: "100" },
      ],
    },
  },
  {
    id: "looks_size",
    spec: "size",
    inputs: [],
    shape: "reporter",
    category: "looks",
    xml: { args: [] },
  },
  {
    id: "looks_costumenumbername",
    spec: "costume %1",
    inputs: ["%m.numberName"],
    shape: "reporter",
    category: "looks",
    xml: {
      args: [{ name: "NUMBER_NAME", type: "field", default: "number" }],
    },
  },
  {
    id: "looks_backdropnumbername",
    spec: "backdrop %1",
    inputs: ["%m.numberName"],
    shape: "reporter",
    category: "looks",
    xml: {
      args: [{ name: "NUMBER_NAME", type: "field", default: "number" }],
    },
  },
  {
    id: "looks_gotofrontback",
    spec: "go to %1 layer",
    inputs: ["%m.frontBack"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [{ name: "FRONT_BACK", type: "field", default: "front" }],
    },
  },
  {
    id: "looks_goforwardbackwardlayers",
    spec: "go %1 %2 layers",
    inputs: ["%m.forwardBackward", "%n"],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        { name: "FORWARD_BACKWARD", type: "field", default: "forward" },
        { name: "NUM", shadow: "math_integer", field: "NUM", default: "1" },
      ],
    },
  },
  // --- SOUND ---
  {
    id: "sound_play",
    spec: "start sound %1",
    inputs: ["%n.sound"],
    shape: "stack",
    category: "sound",
    xml: {
      args: [
        {
          name: "SOUND_MENU",
          shadow: "sound_sounds_menu",
          field: "SOUND_MENU",
          default: "Meow",
        },
      ],
    },
  },
  {
    id: "sound_playuntildone",
    spec: "play sound %1 until done",
    inputs: ["%n.sound"],
    shape: "stack",
    category: "sound",
    xml: {
      args: [
        {
          name: "SOUND_MENU",
          shadow: "sound_sounds_menu",
          field: "SOUND_MENU",
          default: "Meow",
        },
      ],
    },
  },
  {
    id: "sound_stopallsounds",
    spec: "stop all sounds",
    inputs: [],
    shape: "stack",
    category: "sound",
    xml: { args: [] },
  },
  {
    id: "sound_changeeffectby",
    spec: "change %1 effect by %2",
    inputs: ["%m.effect", "%n"],
    shape: "stack",
    category: "sound",
    xml: {
      args: [
        { name: "EFFECT", type: "field", default: "PITCH" },
        { name: "VALUE", shadow: "math_number", field: "NUM", default: "10" },
      ],
    },
  },
  {
    id: "sound_seteffectto",
    spec: "set %1 effect to %2",
    inputs: ["%m.effect", "%n"],
    shape: "stack",
    category: "sound",
    xml: {
      args: [
        { name: "EFFECT", type: "field", default: "PITCH" },
        { name: "VALUE", shadow: "math_number", field: "NUM", default: "100" },
      ],
    },
  },
  {
    id: "sound_cleareffects",
    spec: "clear sound effects",
    inputs: [],
    shape: "stack",
    category: "sound",
    xml: { args: [] },
  },
  {
    id: "sound_changevolumeby",
    spec: "change volume by %1",
    inputs: ["%n"],
    shape: "stack",
    category: "sound",
    xml: {
      args: [
        { name: "VOLUME", shadow: "math_number", field: "NUM", default: "-10" },
      ],
    },
  },
  {
    id: "sound_setvolumeto",
    spec: "set volume to %1 %",
    inputs: ["%n"],
    shape: "stack",
    category: "sound",
    xml: {
      args: [
        { name: "VOLUME", shadow: "math_number", field: "NUM", default: "100" },
      ],
    },
  },
  {
    id: "sound_volume",
    spec: "volume",
    inputs: [],
    shape: "reporter",
    category: "sound",
    xml: { args: [] },
  },
  // --- EVENTS ---
  {
    id: "event_whenflagclicked",
    spec: "when flag clicked",
    inputs: [],
    shape: "hat",
    category: "events",
    xml: { args: [] },
  },
  {
    id: "event_whenkeypressed",
    spec: "when %1 key pressed",
    inputs: ["%m.key"],
    shape: "hat",
    category: "events",
    xml: {
      args: [{ name: "KEY_OPTION", type: "field", default: "space" }],
    },
  },
  {
    id: "event_whenthisspriteclicked",
    spec: "when this sprite clicked",
    inputs: [],
    shape: "hat",
    category: "events",
    xml: { args: [] },
  },
  {
    id: "event_whenbackdropswitchesto",
    spec: "when backdrop switches to %1",
    inputs: ["%m.backdrop"],
    shape: "hat",
    category: "events",
    xml: {
      args: [{ name: "BACKDROP", type: "field", default: "backdrop1" }],
    },
  },
  {
    id: "event_whengreaterthan",
    spec: "when %1 > %2",
    inputs: ["%m.triggerSensor", "%n"],
    shape: "hat",
    category: "events",
    xml: {
      args: [
        { name: "WHENGREATERTHANMENU", type: "field", default: "LOUDNESS" },
        { name: "VALUE", shadow: "math_number", field: "NUM", default: "10" },
      ],
    },
  },
  {
    id: "event_whenbroadcastreceived",
    spec: "when I receive %1",
    inputs: ["%m.broadcast"],
    shape: "hat",
    category: "events",
    xml: {
      args: [
        {
          name: "BROADCAST_OPTION",
          type: "field",
          default: "message1",
          variableType: "broadcast_msg",
        },
      ],
    },
  },
  {
    id: "event_broadcast",
    spec: "broadcast %1",
    inputs: ["%n.broadcast"],
    shape: "stack",
    category: "events",
    xml: {
      args: [
        {
          name: "BROADCAST_INPUT",
          shadow: "event_broadcast_menu",
          field: "BROADCAST_OPTION",
          default: "message1",
          variableType: "broadcast_msg",
        },
      ],
    },
  },
  {
    id: "event_broadcastandwait",
    spec: "broadcast %1 and wait",
    inputs: ["%n.broadcast"],
    shape: "stack",
    category: "events",
    xml: {
      args: [
        {
          name: "BROADCAST_INPUT",
          shadow: "event_broadcast_menu",
          field: "BROADCAST_OPTION",
          default: "message1",
          variableType: "broadcast_msg",
        },
      ],
    },
  },
  // --- CONTROL ---
  {
    id: "control_wait",
    spec: "wait %1 seconds",
    inputs: ["%n"],
    shape: "stack",
    category: "control",
    xml: {
      args: [
        {
          name: "DURATION",
          shadow: "math_positive_number",
          field: "NUM",
          default: "1",
        },
      ],
    },
  },
  {
    id: "control_repeat",
    spec: "repeat %1",
    inputs: ["%n"],
    shape: "c-block",
    category: "control",
    xml: {
      args: [
        {
          name: "TIMES",
          shadow: "math_whole_number",
          field: "NUM",
          default: "10",
        },
      ],
    },
  },
  {
    id: "control_forever",
    spec: "forever",
    inputs: [],
    shape: "c-block-cap", // Cap means no block allowed after it
    category: "control",
    xml: { args: [] },
  },
  {
    id: "control_if",
    spec: "if %1 then",
    inputs: ["%b"],
    shape: "c-block",
    category: "control",
    xml: {
      args: [{ name: "CONDITION", type: "input", default: "" }],
    },
  },
  {
    id: "control_if_else",
    spec: "if %1 then", // Treated specially in parser for 'else'
    inputs: ["%b"],
    shape: "c-block",
    category: "control",
    xml: {
      args: [{ name: "CONDITION", type: "input", default: "" }],
    },
  },
  {
    id: "control_wait_until",
    spec: "wait until %1",
    inputs: ["%b"],
    shape: "stack",
    category: "control",
    xml: {
      args: [{ name: "CONDITION", type: "input", default: "" }],
    },
  },
  {
    id: "control_repeat_until",
    spec: "repeat until %1",
    inputs: ["%b"],
    shape: "c-block",
    category: "control",
    xml: {
      args: [{ name: "CONDITION", type: "input", default: "" }],
    },
  },
  {
    id: "control_while",
    spec: "while %1",
    inputs: ["%b"],
    shape: "c-block",
    category: "control",
    xml: {
      args: [{ name: "CONDITION", type: "input", default: "" }],
    },
  },
  {
    id: "control_stop",
    spec: "stop %1",
    inputs: ["%m.stopOption"],
    shape: "cap",
    category: "control",
    xml: {
      args: [{ name: "STOP_OPTION", type: "field", default: "all" }],
    },
  },
  {
    id: "control_start_as_clone",
    spec: "when I start as a clone",
    inputs: [],
    shape: "hat",
    category: "control",
    xml: { args: [] },
  },
  {
    id: "control_create_clone_of",
    spec: "create clone of %1",
    inputs: ["%n.createCloneOf"],
    shape: "stack",
    category: "control",
    xml: {
      args: [
        {
          name: "CLONE_OPTION",
          shadow: "control_create_clone_of_menu",
          field: "CLONE_OPTION",
          default: "_myself_",
        },
      ],
    },
  },
  {
    id: "control_delete_this_clone",
    spec: "delete this clone",
    inputs: [],
    shape: "cap",
    category: "control",
    xml: { args: [] },
  },
  // --- SENSING ---
  {
    id: "sensing_touchingobject",
    spec: "touching %1 ?",
    inputs: ["%m.touchingObject"],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "TOUCHINGOBJECTMENU",
          shadow: "sensing_touchingobjectmenu",
          field: "TOUCHINGOBJECTMENU",
          default: "_mouse_",
        },
      ],
    },
  },
  {
    id: "sensing_touchingcolor",
    spec: "touching color %1 ?",
    inputs: ["%c"],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "COLOR",
          shadow: "colour_picker",
          field: "COLOUR",
          default: "#9966ff",
        },
      ],
    },
  },
  {
    id: "sensing_coloristouchingcolor",
    spec: "color %1 is touching %2 ?",
    inputs: ["%c", "%c"],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "COLOR",
          shadow: "colour_picker",
          field: "COLOUR",
          default: "#9966ff",
        },
        {
          name: "COLOR2",
          shadow: "colour_picker",
          field: "COLOUR",
          default: "#9966ff",
        },
      ],
    },
  },
  {
    id: "sensing_distanceto",
    spec: "distance to %1",
    inputs: ["%m.distanceto"],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: [
        {
          name: "DISTANCETOMENU",
          shadow: "sensing_distancetomenu",
          field: "DISTANCETOMENU",
          default: "_mouse_",
        },
      ],
    },
  },
  {
    id: "sensing_askandwait",
    spec: "ask %1 and wait",
    inputs: ["%s"],
    shape: "stack",
    category: "sensing",
    xml: {
      args: [
        {
          name: "QUESTION",
          shadow: "text",
          field: "TEXT",
          default: "What's your name?",
        },
      ],
    },
  },
  {
    id: "sensing_answer",
    spec: "answer",
    inputs: [],
    shape: "reporter",
    category: "sensing",
    xml: { args: [] },
  },
  {
    id: "sensing_keypressed",
    spec: "key %1 pressed?",
    inputs: ["%m.key"],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "KEY_OPTION",
          shadow: "sensing_keyoptions",
          field: "KEY_OPTION",
          default: "space",
        },
      ],
    },
  },
  {
    id: "sensing_mousedown",
    spec: "mouse down?",
    inputs: [],
    shape: "boolean",
    category: "sensing",
    xml: { args: [] },
  },
  {
    id: "sensing_mousex",
    spec: "mouse x",
    inputs: [],
    shape: "reporter",
    category: "sensing",
    xml: { args: [] },
  },
  {
    id: "sensing_mousey",
    spec: "mouse y",
    inputs: [],
    shape: "reporter",
    category: "sensing",
    xml: { args: [] },
  },
  {
    id: "sensing_setdragmode",
    spec: "set drag mode %1",
    inputs: ["%m.dragMode"],
    shape: "stack",
    category: "sensing",
    xml: {
      args: [{ name: "DRAG_MODE", type: "field", default: "draggable" }],
    },
  },
  {
    id: "sensing_loudness",
    spec: "loudness",
    inputs: [],
    shape: "reporter",
    category: "sensing",
    xml: { args: [] },
  },
  {
    id: "sensing_timer",
    spec: "timer",
    inputs: [],
    shape: "reporter",
    category: "sensing",
    xml: { args: [] },
  },
  {
    id: "sensing_resettimer",
    spec: "reset timer",
    inputs: [],
    shape: "stack",
    category: "sensing",
    xml: { args: [] },
  },
  {
    id: "sensing_of",
    spec: "%1 of %2",
    inputs: ["%m.attribute", "%m.sprite"],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: [
        { name: "PROPERTY", type: "field", default: "x position" },
        {
          name: "OBJECT",
          shadow: "sensing_of_object_menu",
          field: "OBJECT",
          default: "Sprite1",
        },
      ],
    },
  },
  {
    id: "sensing_current",
    spec: "current %1",
    inputs: ["%m.timeAndDate"],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: [{ name: "CURRENTMENU", type: "field", default: "YEAR" }],
    },
  },
  {
    id: "sensing_dayssince2000",
    spec: "days since 2000",
    inputs: [],
    shape: "reporter",
    category: "sensing",
    xml: { args: [] },
  },
  {
    id: "sensing_username",
    spec: "username",
    inputs: [],
    shape: "reporter",
    category: "sensing",
    xml: { args: [] },
  },
  // --- OPERATORS ---
  {
    id: "operator_add",
    spec: "%1 + %2",
    inputs: ["%n", "%n"],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        { name: "NUM1", shadow: "math_number", field: "NUM", default: "" },
        { name: "NUM2", shadow: "math_number", field: "NUM", default: "" },
      ],
    },
  },
  {
    id: "operator_subtract",
    spec: "%1 - %2",
    inputs: ["%n", "%n"],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        { name: "NUM1", shadow: "math_number", field: "NUM", default: "" },
        { name: "NUM2", shadow: "math_number", field: "NUM", default: "" },
      ],
    },
  },
  {
    id: "operator_multiply",
    spec: "%1 * %2",
    inputs: ["%n", "%n"],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        { name: "NUM1", shadow: "math_number", field: "NUM", default: "" },
        { name: "NUM2", shadow: "math_number", field: "NUM", default: "" },
      ],
    },
  },
  {
    id: "operator_divide",
    spec: "%1 / %2",
    inputs: ["%n", "%n"],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        { name: "NUM1", shadow: "math_number", field: "NUM", default: "" },
        { name: "NUM2", shadow: "math_number", field: "NUM", default: "" },
      ],
    },
  },
  {
    id: "operator_random",
    spec: "pick random %1 to %2",
    inputs: ["%n", "%n"],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        { name: "FROM", shadow: "math_number", field: "NUM", default: "1" },
        { name: "TO", shadow: "math_number", field: "NUM", default: "10" },
      ],
    },
  },
  {
    id: "operator_lt",
    spec: "%1 less than %2",
    inputs: ["%s", "%s"],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        { name: "OPERAND1", shadow: "text", field: "TEXT", default: "" },
        { name: "OPERAND2", shadow: "text", field: "TEXT", default: "" },
      ],
    },
  },
  {
    id: "operator_equals",
    spec: "%1 equals %2",
    inputs: ["%s", "%s"],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        { name: "OPERAND1", shadow: "text", field: "TEXT", default: "" },
        { name: "OPERAND2", shadow: "text", field: "TEXT", default: "" },
      ],
    },
  },
  {
    id: "operator_gt",
    spec: "%1 greater than %2",
    inputs: ["%s", "%s"],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        { name: "OPERAND1", shadow: "text", field: "TEXT", default: "" },
        { name: "OPERAND2", shadow: "text", field: "TEXT", default: "" },
      ],
    },
  },
  {
    id: "operator_and",
    spec: "%1 and %2",
    inputs: ["%b", "%b"],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        { name: "OPERAND1", shadow: "", field: "", default: "" },
        { name: "OPERAND2", shadow: "", field: "", default: "" },
      ],
    },
  },
  {
    id: "operator_or",
    spec: "%1 or %2",
    inputs: ["%b", "%b"],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        { name: "OPERAND1", shadow: "", field: "", default: "" },
        { name: "OPERAND2", shadow: "", field: "", default: "" },
      ],
    },
  },
  {
    id: "operator_not",
    spec: "not %1",
    inputs: ["%b"],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [{ name: "OPERAND", shadow: "", field: "", default: "" }],
    },
  },
  {
    id: "operator_join",
    spec: "join %1 %2",
    inputs: ["%s", "%s"],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        { name: "STRING1", shadow: "text", field: "TEXT", default: "hello" },
        { name: "STRING2", shadow: "text", field: "TEXT", default: "world" },
      ],
    },
  },
  {
    id: "operator_letter_of",
    spec: "letter %1 of %2",
    inputs: ["%n", "%s"],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "LETTER",
          shadow: "math_whole_number",
          field: "NUM",
          default: "1",
        },
        { name: "STRING", shadow: "text", field: "TEXT", default: "world" },
      ],
    },
  },
  {
    id: "operator_length",
    spec: "length of %1",
    inputs: ["%s"],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        { name: "STRING", shadow: "text", field: "TEXT", default: "world" },
      ],
    },
  },
  {
    id: "operator_contains",
    spec: "%1 contains %2 ?",
    inputs: ["%s", "%s"],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        { name: "STRING1", shadow: "text", field: "TEXT", default: "hello" },
        { name: "STRING2", shadow: "text", field: "TEXT", default: "world" },
      ],
    },
  },
  {
    id: "operator_mod",
    spec: "%1 mod %2",
    inputs: ["%n", "%n"],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        { name: "NUM1", shadow: "math_number", field: "NUM", default: "" },
        { name: "NUM2", shadow: "math_number", field: "NUM", default: "" },
      ],
    },
  },
  {
    id: "operator_round",
    spec: "round %1",
    inputs: ["%n"],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [{ name: "NUM", shadow: "math_number", field: "NUM", default: "" }],
    },
  },
  {
    id: "operator_mathop",
    spec: "%1 of %2",
    inputs: ["%m.mathop", "%n"],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        { name: "OPERATOR", type: "field", default: "abs" },
        { name: "NUM", shadow: "math_number", field: "NUM", default: "" },
      ],
    },
  },
  // --- DATA ---
  {
    id: "data_variable",
    spec: "variable %1",
    inputs: ["%m.var"],
    shape: "reporter",
    category: "data",
    xml: {
      args: [
        {
          name: "VARIABLE",
          type: "field",
          default: "my variable",
          variableType: "",
        },
      ],
    },
  },
  {
    id: "data_setvariableto",
    spec: "set %1 to %2",
    inputs: ["%m.var", "%s"],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        {
          name: "VARIABLE",
          type: "field",
          default: "my variable",
          variableType: "",
        },
        { name: "VALUE", shadow: "text", field: "TEXT", default: "0" },
      ],
    },
  },
  {
    id: "data_changevariableby",
    spec: "change %1 by %2",
    inputs: ["%m.var", "%n"],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        {
          name: "VARIABLE",
          type: "field",
          default: "my variable",
          variableType: "",
        },
        { name: "VALUE", shadow: "math_number", field: "NUM", default: "1" },
      ],
    },
  },
  {
    id: "data_showvariable",
    spec: "show variable %1",
    inputs: ["%m.var"],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        {
          name: "VARIABLE",
          type: "field",
          default: "my variable",
          variableType: "",
        },
      ],
    },
  },
  {
    id: "data_hidevariable",
    spec: "hide variable %1",
    inputs: ["%m.var"],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        {
          name: "VARIABLE",
          type: "field",
          default: "my variable",
          variableType: "",
        },
      ],
    },
  },
  // --- LISTS ---
  {
    id: "data_listcontents",
    spec: "list %1",
    inputs: ["%m.list"],
    shape: "reporter",
    category: "data",
    xml: {
      args: [
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
      ],
    },
  },
  {
    id: "data_addtolist",
    spec: "add %1 to %2",
    inputs: ["%s", "%m.list"],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        { name: "ITEM", shadow: "text", field: "TEXT", default: "thing" },
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
      ],
    },
  },
  {
    id: "data_deleteoflist",
    spec: "delete %1 of %2",
    inputs: ["%d.listIndex", "%m.list"],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        { name: "INDEX", shadow: "math_integer", field: "NUM", default: "1" },
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
      ],
    },
  },
  {
    id: "data_deletealloflist",
    spec: "delete all of %1",
    inputs: ["%m.list"],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
      ],
    },
  },
  {
    id: "data_insertatlist",
    spec: "insert %1 at %2 of %3",
    inputs: ["%s", "%d.listIndex", "%m.list"],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        { name: "ITEM", shadow: "text", field: "TEXT", default: "thing" },
        { name: "INDEX", shadow: "math_integer", field: "NUM", default: "1" },
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
      ],
    },
  },
  {
    id: "data_replaceitemoflist",
    spec: "replace item %1 of %2 with %3",
    inputs: ["%d.listIndex", "%m.list", "%s"],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        { name: "INDEX", shadow: "math_integer", field: "NUM", default: "1" },
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
        { name: "ITEM", shadow: "text", field: "TEXT", default: "thing" },
      ],
    },
  },
  {
    id: "data_itemoflist",
    spec: "item %1 of %2",
    inputs: ["%d.listIndex", "%m.list"],
    shape: "reporter",
    category: "data",
    xml: {
      args: [
        { name: "INDEX", shadow: "math_integer", field: "NUM", default: "1" },
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
      ],
    },
  },
  {
    id: "data_itemnumoflist",
    spec: "item # of %1 in %2",
    inputs: ["%s", "%m.list"],
    shape: "reporter",
    category: "data",
    xml: {
      args: [
        { name: "ITEM", shadow: "text", field: "TEXT", default: "thing" },
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
      ],
    },
  },
  {
    id: "data_lengthoflist",
    spec: "length of list %1",
    inputs: ["%m.list"],
    shape: "reporter",
    category: "data",
    xml: {
      args: [
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
      ],
    },
  },
  {
    id: "data_listcontainsitem",
    spec: "list %1 contains %2 ?",
    inputs: ["%m.list", "%s"],
    shape: "boolean",
    category: "data",
    xml: {
      args: [
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
        { name: "ITEM", shadow: "text", field: "TEXT", default: "thing" },
      ],
    },
  },
  {
    id: "data_showlist",
    spec: "show list %1",
    inputs: ["%m.list"],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
      ],
    },
  },
  {
    id: "data_hidelist",
    spec: "hide list %1",
    inputs: ["%m.list"],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list",
        },
      ],
    },
  },
  // --- CUSTOM BLOCKS (PROCEDURES) ---
  {
    id: "argument_reporter_string_number",
    spec: "param %1",
    inputs: ["%s"],
    shape: "reporter",
    category: "custom",
    xml: {
      args: [{ name: "VALUE", type: "field", default: "input" }],
    },
  },
  {
    id: "argument_reporter_boolean",
    spec: "param %1",
    inputs: ["%s"],
    shape: "boolean",
    category: "custom",
    xml: {
      args: [{ name: "VALUE", type: "field", default: "boolean" }],
    },
  },
];
