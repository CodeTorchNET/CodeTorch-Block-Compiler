export default [
  {
    id: "motion_changebyxy",
    spec: "change by x: %1 y: %2",
    inputs: [
      "%n",
      "%n"
    ],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "DX",
          shadow: "math_number",
          field: "NUM",
          default: "10"
        },
        {
          name: "DY",
          shadow: "math_number",
          field: "NUM",
          default: "10"
        }
      ]
    },
    advanced: true
  },
  {
    id: "motion_pointtowardsxy",
    spec: "point towards x: %1 y: %2",
    inputs: [
      "%n",
      "%n"
    ],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "X",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        },
        {
          name: "Y",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        }
      ]
    },
    advanced: true
  },
  {
    id: "motion_movebacksteps",
    spec: "move back %1 steps",
    inputs: [
      "%n"
    ],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "STEPS",
          shadow: "math_number",
          field: "NUM",
          default: "10"
        }
      ]
    },
    advanced: true
  },
  {
    id: "motion_moveupdownsteps",
    spec: "move %1 %2 steps",
    inputs: [
      "%m.DIRECTION",
      "%n"
    ],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "DIRECTION",
          type: "field",
          default: "up"
        },
        {
          name: "STEPS",
          shadow: "math_number",
          field: "NUM",
          default: "10"
        }
      ]
    },
    advanced: true
  },
  {
    id: "motion_turnaround",
    spec: "turn around",
    inputs: [],
    shape: "stack",
    category: "motion",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "motion_pointinrandomdirection",
    spec: "point in random direction",
    inputs: [],
    shape: "stack",
    category: "motion",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "motion_turnrightaroundxy",
    spec: "turn right %1 degrees around x: %2 y: %3",
    inputs: [
      "%n",
      "%n",
      "%n"
    ],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "DEGREES",
          shadow: "math_number",
          field: "NUM",
          default: "15"
        },
        {
          name: "X",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        },
        {
          name: "Y",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        }
      ]
    },
    advanced: true
  },
  {
    id: "motion_turnleftaroundxy",
    spec: "turn left %1 degrees around x: %2 y: %3",
    inputs: [
      "%n",
      "%n",
      "%n"
    ],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "DEGREES",
          shadow: "math_number",
          field: "NUM",
          default: "15"
        },
        {
          name: "X",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        },
        {
          name: "Y",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        }
      ]
    },
    advanced: true
  },
  {
    id: "motion_ifonspritebounce",
    spec: "if touching %1 , bounce",
    inputs: [
      "%s"
    ],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "SPRITE",
          shadow: "motion_pointtowards_menu",
          field: "TOWARDS",
          default: "_mouse_"
        }
      ]
    },
    advanced: true
  },
  {
    id: "motion_ifonxybounce",
    spec: "if touching x: %1 y: %2 , bounce",
    inputs: [
      "%n",
      "%n"
    ],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "X",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        },
        {
          name: "Y",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        }
      ]
    },
    advanced: true
  },
  {
    id: "motion_move_sprite_to_scene_side",
    spec: "move to stage %1",
    inputs: [
      "%m.ALIGNMENT"
    ],
    shape: "stack",
    category: "motion",
    xml: {
      args: [
        {
          name: "ALIGNMENT",
          type: "field",
          default: "bottom-left"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_stoptalking",
    spec: "stop speaking",
    inputs: [],
    shape: "stack",
    category: "looks",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "looks_setFont",
    spec: "set font to %1 size %2",
    inputs: [
      "%s",
      "%n"
    ],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "font",
          shadow: "text",
          field: "TEXT",
          default: "Helvetica"
        },
        {
          name: "size",
          shadow: "math_number",
          field: "NUM",
          default: "14"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_setColor",
    spec: "set %1 color to %2",
    inputs: [
      "%m.prop",
      "%s"
    ],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "prop",
          type: "field",
          default: "BUBBLE_FILL"
        },
        {
          name: "color",
          shadow: "colour_picker",
          field: "COLOUR",
          default: "#ba5367"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_setShape",
    spec: "set speech bubble %1 to %2",
    inputs: [
      "%m.prop",
      "%n"
    ],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "prop",
          type: "field",
          default: "STROKE_WIDTH"
        },
        {
          name: "color",
          shadow: "math_number",
          field: "NUM",
          default: "2"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_sayWidth",
    spec: "speech bubble width",
    inputs: [],
    shape: "reporter",
    category: "looks",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "looks_sayHeight",
    spec: "speech bubble height",
    inputs: [],
    shape: "reporter",
    category: "looks",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "looks_previouscostume",
    spec: "previous costume",
    inputs: [],
    shape: "stack",
    category: "looks",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "looks_previousbackdrop",
    spec: "previous backdrop",
    inputs: [],
    shape: "stack",
    category: "looks",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "looks_getinputofcostume",
    spec: "%1 of costume %2",
    inputs: [
      "%s",
      "%s"
    ],
    shape: "reporter",
    category: "looks",
    xml: {
      args: [
        {
          name: "INPUT",
          shadow: "looks_getinput_menu",
          field: "INPUT",
          default: "width"
        },
        {
          name: "COSTUME",
          shadow: "looks_costume",
          field: "COSTUME",
          default: "c"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_setStretch",
    spec: "set stretch to x: %1 y: %2",
    inputs: [
      "%n",
      "%n"
    ],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "X",
          shadow: "math_number",
          field: "NUM",
          default: "100"
        },
        {
          name: "Y",
          shadow: "math_number",
          field: "NUM",
          default: "100"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_changeStretch",
    spec: "change stretch by x: %1 y: %2",
    inputs: [
      "%n",
      "%n"
    ],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "X",
          shadow: "math_number",
          field: "NUM",
          default: "10"
        },
        {
          name: "Y",
          shadow: "math_number",
          field: "NUM",
          default: "10"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_stretchGetX",
    spec: "x stretch",
    inputs: [],
    shape: "reporter",
    category: "looks",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "looks_stretchGetY",
    spec: "y stretch",
    inputs: [],
    shape: "reporter",
    category: "looks",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "looks_setTintColor",
    spec: "set tint color to %1",
    inputs: [
      "%s"
    ],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "color",
          shadow: "colour_picker",
          field: "COLOUR",
          default: "#4d4994"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_tintColor",
    spec: "tint color",
    inputs: [],
    shape: "reporter",
    category: "looks",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "looks_getEffectValue",
    spec: "%1 effect",
    inputs: [
      "%m.EFFECT"
    ],
    shape: "reporter",
    category: "looks",
    xml: {
      args: [
        {
          name: "EFFECT",
          type: "field",
          default: "COLOR"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_getSpriteVisible",
    spec: "visible?",
    inputs: [],
    shape: "boolean",
    category: "looks",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "looks_changeVisibilityOfSpriteShow",
    spec: "show %1",
    inputs: [
      "%s"
    ],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "VISIBLE_OPTION",
          shadow: "looks_changeVisibilityOfSprite_menu",
          field: "VISIBLE_OPTION",
          default: "_myself_"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_changeVisibilityOfSpriteHide",
    spec: "hide %1",
    inputs: [
      "%s"
    ],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "VISIBLE_OPTION",
          shadow: "looks_changeVisibilityOfSprite_menu",
          field: "VISIBLE_OPTION",
          default: "_myself_"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_getOtherSpriteVisible",
    spec: "is %1 visible?",
    inputs: [
      "%s"
    ],
    shape: "boolean",
    category: "looks",
    xml: {
      args: [
        {
          name: "VISIBLE_OPTION",
          shadow: "looks_getOtherSpriteVisible_menu",
          field: "VISIBLE_OPTION",
          default: "_myself_"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_layersSetLayer",
    spec: "go to layer %1",
    inputs: [
      "%n"
    ],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "NUM",
          shadow: "math_integer",
          field: "NUM",
          default: "1"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_goTargetLayer",
    spec: "go %1 %2",
    inputs: [
      "%m.FORWARD_BACKWARD",
      "%s"
    ],
    shape: "stack",
    category: "looks",
    xml: {
      args: [
        {
          name: "FORWARD_BACKWARD",
          type: "field",
          default: "infront"
        },
        {
          name: "VISIBLE_OPTION",
          shadow: "looks_getOtherSpriteVisible_menu",
          field: "VISIBLE_OPTION",
          default: "_myself_"
        }
      ]
    },
    advanced: true
  },
  {
    id: "looks_layersGetLayer",
    spec: "layer",
    inputs: [],
    shape: "reporter",
    category: "looks",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "sound_play_at_seconds_until_done",
    spec: "play sound %1 from %2 seconds until done",
    inputs: [
      "%s",
      "%n"
    ],
    shape: "stack",
    category: "sound",
    xml: {
      args: [
        {
          name: "SOUND_MENU",
          shadow: "sound_sounds_menu",
          field: "SOUND_MENU",
          default: ""
        },
        {
          name: "VALUE",
          shadow: "math_number",
          field: "NUM",
          default: "1"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sound_play_at_seconds",
    spec: "start sound %1 at %2 seconds",
    inputs: [
      "%s",
      "%n"
    ],
    shape: "stack",
    category: "sound",
    xml: {
      args: [
        {
          name: "SOUND_MENU",
          shadow: "sound_sounds_menu",
          field: "SOUND_MENU",
          default: ""
        },
        {
          name: "VALUE",
          shadow: "math_number",
          field: "NUM",
          default: "1"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sound_stop",
    spec: "stop sound %1",
    inputs: [
      "%s"
    ],
    shape: "stack",
    category: "sound",
    xml: {
      args: [
        {
          name: "SOUND_MENU",
          shadow: "sound_sounds_menu",
          field: "SOUND_MENU",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "sound_playallsounds",
    spec: "play all sounds",
    inputs: [],
    shape: "stack",
    category: "sound",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "sound_set_stop_fadeout_to",
    spec: "set fade out to %1 seconds on %2",
    inputs: [
      "%n",
      "%s"
    ],
    shape: "stack",
    category: "sound",
    xml: {
      args: [
        {
          name: "VALUE",
          shadow: "math_number",
          field: "NUM",
          default: "1"
        },
        {
          name: "SOUND_MENU",
          shadow: "sound_sounds_menu",
          field: "SOUND_MENU",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "sound_isSoundPlaying",
    spec: "is %1 playing?",
    inputs: [
      "%s"
    ],
    shape: "boolean",
    category: "sound",
    xml: {
      args: [
        {
          name: "SOUND_MENU",
          shadow: "sound_sounds_menu",
          field: "SOUND_MENU",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "sound_getLength",
    spec: "length of sound %1",
    inputs: [
      "%s"
    ],
    shape: "reporter",
    category: "sound",
    xml: {
      args: [
        {
          name: "SOUND_MENU",
          shadow: "sound_sounds_menu",
          field: "SOUND_MENU",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "sound_getEffectValue",
    spec: "sound %1 effect",
    inputs: [
      "%m.EFFECT"
    ],
    shape: "reporter",
    category: "sound",
    xml: {
      args: [
        {
          name: "EFFECT",
          type: "field",
          default: "PITCH"
        }
      ]
    },
    advanced: true
  },
  {
    id: "event_whenstopclicked",
    spec: "when stop clicked",
    inputs: [],
    shape: "hat",
    category: "events",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "event_whenkeyhit",
    spec: "when %1 key hit",
    inputs: [
      "%m.KEY_OPTION"
    ],
    shape: "hat",
    category: "events",
    xml: {
      args: [
        {
          name: "KEY_OPTION",
          type: "field",
          default: "space"
        }
      ]
    },
    advanced: true
  },
  {
    id: "event_whenmousescrolled",
    spec: "when mouse is scrolled %1",
    inputs: [
      "%m.KEY_OPTION"
    ],
    shape: "hat",
    category: "events",
    xml: {
      args: [
        {
          name: "KEY_OPTION",
          type: "field",
          default: "up"
        }
      ]
    },
    advanced: true
  },
  {
    id: "event_always",
    spec: "always",
    inputs: [],
    shape: "hat",
    category: "events",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "event_whenanything",
    spec: "when %1",
    inputs: [
      "%b"
    ],
    shape: "hat",
    category: "events",
    xml: {
      args: [
        {
          name: "ANYTHING",
          type: "input",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_waitsecondsoruntil",
    spec: "wait %1 seconds or until %2",
    inputs: [
      "%n",
      "%b"
    ],
    shape: "stack",
    category: "control",
    xml: {
      args: [
        {
          name: "DURATION",
          shadow: "math_positive_number",
          field: "NUM",
          default: "1"
        },
        {
          name: "CONDITION",
          type: "input",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_waittick",
    spec: "wait until next tick",
    inputs: [],
    shape: "stack",
    category: "control",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "control_repeatForSeconds",
    spec: "repeat for %1 seconds",
    inputs: [
      "%n"
    ],
    shape: "c-block",
    category: "control",
    xml: {
      args: [
        {
          name: "TIMES",
          shadow: "math_positive_number",
          field: "NUM",
          default: "1"
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_exitLoop",
    spec: "escape loop",
    inputs: [],
    shape: "cap",
    category: "control",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "control_continueLoop",
    spec: "continue loop",
    inputs: [],
    shape: "cap",
    category: "control",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "control_switch",
    spec: "switch %1",
    inputs: [
      "%s"
    ],
    shape: "c-block",
    category: "control",
    xml: {
      args: [
        {
          name: "CONDITION",
          shadow: "text",
          field: "TEXT",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_case",
    spec: "case %1",
    inputs: [
      "%s"
    ],
    shape: "c-block",
    category: "control",
    xml: {
      args: [
        {
          name: "CONDITION",
          shadow: "text",
          field: "TEXT",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_case_next",
    spec: "run next case when %1",
    inputs: [
      "%s"
    ],
    shape: "stack",
    category: "control",
    xml: {
      args: [
        {
          name: "CONDITION",
          shadow: "text",
          field: "TEXT",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_exitCase",
    spec: "exit case",
    inputs: [],
    shape: "cap",
    category: "control",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "control_if_return_else_return",
    spec: "if %1 then %2 else %3",
    inputs: [
      "%b",
      "%s",
      "%s"
    ],
    shape: "reporter",
    category: "control",
    xml: {
      args: [
        {
          name: "boolean",
          type: "input",
          default: ""
        },
        {
          name: "TEXT1",
          shadow: "text",
          field: "TEXT",
          default: "yes"
        },
        {
          name: "TEXT2",
          shadow: "text",
          field: "TEXT",
          default: "no"
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_throw_error",
    spec: "throw error %1",
    inputs: [
      "%s"
    ],
    shape: "cap",
    category: "control",
    xml: {
      args: [
        {
          name: "ERROR",
          shadow: "text",
          field: "TEXT",
          default: "Oops!"
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_error",
    spec: "error",
    inputs: [],
    shape: "reporter",
    category: "control",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "control_run_as_sprite",
    spec: "as %1 do",
    inputs: [
      "%s"
    ],
    shape: "c-block",
    category: "control",
    xml: {
      args: [
        {
          name: "RUN_AS_OPTION",
          shadow: "control_run_as_sprite_menu",
          field: "RUN_AS_OPTION",
          default: "_stage_"
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_stop_sprite",
    spec: "stop sprite %1",
    inputs: [
      "%s"
    ],
    shape: "stack",
    category: "control",
    xml: {
      args: [
        {
          name: "STOP_OPTION",
          shadow: "control_stop_sprite_menu",
          field: "STOP_OPTION",
          default: "_stage_"
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_backToGreenFlag",
    spec: "run green flag",
    inputs: [],
    shape: "stack",
    category: "control",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "control_new_script",
    spec: "new script",
    inputs: [],
    shape: "c-block",
    category: "control",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "control_delete_clones_of",
    spec: "delete clones of %1",
    inputs: [
      "%s"
    ],
    shape: "stack",
    category: "control",
    xml: {
      args: [
        {
          name: "CLONE_OPTION",
          shadow: "control_create_clone_of_menu",
          field: "CLONE_OPTION",
          default: "_myself_"
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_is_clone",
    spec: "is clone?",
    inputs: [],
    shape: "boolean",
    category: "control",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "sensing_objecttouchingobject",
    spec: "%1 touching %2 ?",
    inputs: [
      "%s",
      "%s"
    ],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "FULLTOUCHINGOBJECTMENU",
          shadow: "sensing_fulltouchingobjectmenu",
          field: "FULLTOUCHINGOBJECTMENU",
          default: "_mouse_"
        },
        {
          name: "SPRITETOUCHINGOBJECTMENU",
          shadow: "sensing_touchingobjectmenusprites",
          field: "SPRITETOUCHINGOBJECTMENU",
          default: "_myself_"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_objecttouchingclonesprite",
    spec: "%1 touching clone of %2 ?",
    inputs: [
      "%s",
      "%s"
    ],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "FULLTOUCHINGOBJECTMENU",
          shadow: "sensing_fulltouchingobjectmenu",
          field: "FULLTOUCHINGOBJECTMENU",
          default: "_mouse_"
        },
        {
          name: "SPRITETOUCHINGOBJECTMENU",
          shadow: "sensing_touchingobjectmenusprites",
          field: "SPRITETOUCHINGOBJECTMENU",
          default: "_myself_"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_getxyoftouchingsprite",
    spec: "%1 of point touching %2",
    inputs: [
      "%m.XY",
      "%s"
    ],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: [
        {
          name: "XY",
          type: "field",
          default: "x"
        },
        {
          name: "SPRITE",
          shadow: "sensing_distancetomenu",
          field: "DISTANCETOMENU",
          default: "_mouse_"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_distanceTo",
    spec: "distance from x: %1 y: %2 to x: %3 y: %4",
    inputs: [
      "%n",
      "%n",
      "%n",
      "%n"
    ],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: [
        {
          name: "x1",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        },
        {
          name: "y1",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        },
        {
          name: "x2",
          shadow: "math_number",
          field: "NUM",
          default: "100"
        },
        {
          name: "y2",
          shadow: "math_number",
          field: "NUM",
          default: "100"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_directionTo",
    spec: "direction to x: %1 y: %2 from x: %3 y: %4",
    inputs: [
      "%n",
      "%n",
      "%n",
      "%n"
    ],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: [
        {
          name: "x2",
          shadow: "math_number",
          field: "NUM",
          default: "100"
        },
        {
          name: "y2",
          shadow: "math_number",
          field: "NUM",
          default: "100"
        },
        {
          name: "x1",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        },
        {
          name: "y1",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_keyhit",
    spec: "key %1 hit?",
    inputs: [
      "%s"
    ],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "KEY_OPTION",
          shadow: "sensing_keyoptions",
          field: "KEY_OPTION",
          default: "space"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_mousescrolling",
    spec: "mouse scrolling %1 ?",
    inputs: [
      "%s"
    ],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "SCROLL_OPTION",
          shadow: "sensing_scrolldirections",
          field: "SCROLL_OPTION",
          default: "up"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_mouseclicked",
    spec: "mouse clicked?",
    inputs: [],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "sensing_thing_is_number",
    spec: "%1 is a number?",
    inputs: [
      "%s"
    ],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "TEXT1",
          shadow: "text",
          field: "TEXT",
          default: "10"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_thing_is_text",
    spec: "%1 is text?",
    inputs: [
      "%s"
    ],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "TEXT1",
          shadow: "text",
          field: "TEXT",
          default: "apple"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_thing_has_number",
    spec: "%1 contains a number?",
    inputs: [
      "%s"
    ],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "TEXT1",
          shadow: "text",
          field: "TEXT",
          default: "apple10"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_isUpperCase",
    spec: "is %1 uppercase?",
    inputs: [
      "%s"
    ],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "text",
          shadow: "text",
          field: "TEXT",
          default: "A"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_set_of",
    spec: "set %1 of %2 to %3",
    inputs: [
      "%m.PROPERTY",
      "%s",
      "%s"
    ],
    shape: "stack",
    category: "sensing",
    xml: {
      args: [
        {
          name: "PROPERTY",
          type: "field",
          default: "x position"
        },
        {
          name: "OBJECT",
          shadow: "sensing_of_object_menu",
          field: "OBJECT",
          default: "_stage_"
        },
        {
          name: "VALUE",
          shadow: "text",
          field: "TEXT",
          default: "0"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_setclipboard",
    spec: "copy %1 to clipboard",
    inputs: [
      "%s"
    ],
    shape: "stack",
    category: "sensing",
    xml: {
      args: [
        {
          name: "ITEM",
          shadow: "text",
          field: "TEXT",
          default: "Hello!"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_getclipboard",
    spec: "clipboard",
    inputs: [],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "sensing_getdragmode",
    spec: "draggable?",
    inputs: [],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "sensing_mobile",
    spec: "touch device?",
    inputs: [],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "sensing_fingerdown",
    spec: "finger %1 down?",
    inputs: [
      "%s"
    ],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "FINGER_OPTION",
          shadow: "sensing_fingeroptions",
          field: "FINGER_OPTION",
          default: "1"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_fingertapped",
    spec: "finger %1 tapped?",
    inputs: [
      "%s"
    ],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "FINGER_OPTION",
          shadow: "sensing_fingeroptions",
          field: "FINGER_OPTION",
          default: "1"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_fingerx",
    spec: "finger %1 x",
    inputs: [
      "%s"
    ],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: [
        {
          name: "FINGER_OPTION",
          shadow: "sensing_fingeroptions",
          field: "FINGER_OPTION",
          default: "1"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_fingery",
    spec: "finger %1 y",
    inputs: [
      "%s"
    ],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: [
        {
          name: "FINGER_OPTION",
          shadow: "sensing_fingeroptions",
          field: "FINGER_OPTION",
          default: "1"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_regextest",
    spec: "regex %1 flags %2 matches %3 ?",
    inputs: [
      "%s",
      "%s",
      "%s"
    ],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: [
        {
          name: "reg",
          shadow: "text",
          field: "TEXT",
          default: "[a-z]+"
        },
        {
          name: "regrule",
          shadow: "text",
          field: "TEXT",
          default: "i"
        },
        {
          name: "text",
          shadow: "text",
          field: "TEXT",
          default: "Hello"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_getspritewithattrib",
    spec: "sprite with %1 set to %2",
    inputs: [
      "%s",
      "%s"
    ],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: [
        {
          name: "var",
          shadow: "text",
          field: "TEXT",
          default: "x position"
        },
        {
          name: "val",
          shadow: "text",
          field: "TEXT",
          default: "0"
        }
      ]
    },
    advanced: true
  },
  {
    id: "sensing_getoperatingsystem",
    spec: "operating system",
    inputs: [],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "sensing_getbrowser",
    spec: "browser",
    inputs: [],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "sensing_geturl",
    spec: "page url",
    inputs: [],
    shape: "reporter",
    category: "sensing",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "sensing_loggedin",
    spec: "signed in?",
    inputs: [],
    shape: "boolean",
    category: "sensing",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "operator_power",
    spec: "%1 ^ %2",
    inputs: [
      "%n",
      "%n"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "NUM1",
          shadow: "math_number",
          field: "NUM",
          default: "2"
        },
        {
          name: "NUM2",
          shadow: "math_number",
          field: "NUM",
          default: "3"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_constrainnumber",
    spec: "limit %1 between %2 and %3",
    inputs: [
      "%n",
      "%n",
      "%n"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "inp",
          shadow: "math_number",
          field: "NUM",
          default: "50"
        },
        {
          name: "min",
          shadow: "math_number",
          field: "NUM",
          default: "1"
        },
        {
          name: "max",
          shadow: "math_number",
          field: "NUM",
          default: "100"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_lerpFunc",
    spec: "blend %1 to %2 by %3",
    inputs: [
      "%n",
      "%n",
      "%n"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "ONE",
          shadow: "math_number",
          field: "NUM",
          default: "0"
        },
        {
          name: "TWO",
          shadow: "math_number",
          field: "NUM",
          default: "100"
        },
        {
          name: "AMOUNT",
          shadow: "math_number",
          field: "NUM",
          default: "0.5"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_gtorequal",
    spec: "%1 ≥ %2",
    inputs: [
      "%s",
      "%s"
    ],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        {
          name: "OPERAND1",
          shadow: "text",
          field: "TEXT",
          default: ""
        },
        {
          name: "OPERAND2",
          shadow: "text",
          field: "TEXT",
          default: "50"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_ltorequal",
    spec: "%1 ≤ %2",
    inputs: [
      "%s",
      "%s"
    ],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        {
          name: "OPERAND1",
          shadow: "text",
          field: "TEXT",
          default: ""
        },
        {
          name: "OPERAND2",
          shadow: "text",
          field: "TEXT",
          default: "50"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_notequal",
    spec: "%1 ≠ %2",
    inputs: [
      "%s",
      "%s"
    ],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        {
          name: "OPERAND1",
          shadow: "text",
          field: "TEXT",
          default: ""
        },
        {
          name: "OPERAND2",
          shadow: "text",
          field: "TEXT",
          default: "50"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_trueBoolean",
    spec: "true",
    inputs: [],
    shape: "boolean",
    category: "operators",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "operator_falseBoolean",
    spec: "false",
    inputs: [],
    shape: "boolean",
    category: "operators",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "operator_randomBoolean",
    spec: "random true or false",
    inputs: [],
    shape: "boolean",
    category: "operators",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "operator_xor",
    spec: "%1 xor %2",
    inputs: [
      "%b",
      "%b"
    ],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        {
          name: "OPERAND1",
          type: "input",
          default: ""
        },
        {
          name: "OPERAND2",
          type: "input",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_newLine",
    spec: "new line",
    inputs: [],
    shape: "reporter",
    category: "operators",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "operator_tabCharacter",
    spec: "tab",
    inputs: [],
    shape: "reporter",
    category: "operators",
    xml: {
      args: []
    },
    advanced: true
  },
  {
    id: "operator_getLettersFromIndexToIndexInTextFixed",
    spec: "letters %1 to %2 of %3",
    inputs: [
      "%n",
      "%n",
      "%s"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "INDEX1",
          shadow: "math_number",
          field: "NUM",
          default: "2"
        },
        {
          name: "INDEX2",
          shadow: "math_number",
          field: "NUM",
          default: "4"
        },
        {
          name: "TEXT",
          shadow: "text",
          field: "TEXT",
          default: "apple"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_indexOfTextInText",
    spec: "position of %1 in %2",
    inputs: [
      "%s",
      "%s"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "TEXT1",
          shadow: "text",
          field: "TEXT",
          default: "world"
        },
        {
          name: "TEXT2",
          shadow: "text",
          field: "TEXT",
          default: "Hello world!"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_lastIndexOfTextInText",
    spec: "last position of %1 in %2",
    inputs: [
      "%s",
      "%s"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "TEXT1",
          shadow: "text",
          field: "TEXT",
          default: "o"
        },
        {
          name: "TEXT2",
          shadow: "text",
          field: "TEXT",
          default: "Hello world!"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_countAppearTimes",
    spec: "times %1 appears in %2",
    inputs: [
      "%s",
      "%s"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "TEXT1",
          shadow: "text",
          field: "TEXT",
          default: "o"
        },
        {
          name: "TEXT2",
          shadow: "text",
          field: "TEXT",
          default: "Hello world!"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_textStartsOrEndsWith",
    spec: "%1 %2 with %3 ?",
    inputs: [
      "%s",
      "%m.OPTION",
      "%s"
    ],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        {
          name: "TEXT1",
          shadow: "text",
          field: "TEXT",
          default: "apple"
        },
        {
          name: "OPTION",
          type: "field",
          default: "starts"
        },
        {
          name: "TEXT2",
          shadow: "text",
          field: "TEXT",
          default: "app"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_textIncludesLetterFrom",
    spec: "%1 includes a letter from %2 ?",
    inputs: [
      "%s",
      "%s"
    ],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        {
          name: "TEXT1",
          shadow: "text",
          field: "TEXT",
          default: "apple"
        },
        {
          name: "TEXT2",
          shadow: "text",
          field: "TEXT",
          default: "aeiou"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_replaceAll",
    spec: "in %1 replace all %2 with %3",
    inputs: [
      "%s",
      "%s",
      "%s"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "text",
          shadow: "text",
          field: "TEXT",
          default: "foo bar foo"
        },
        {
          name: "term",
          shadow: "text",
          field: "TEXT",
          default: "foo"
        },
        {
          name: "res",
          shadow: "text",
          field: "TEXT",
          default: "baz"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_replaceFirst",
    spec: "in %1 replace first %2 with %3",
    inputs: [
      "%s",
      "%s",
      "%s"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "text",
          shadow: "text",
          field: "TEXT",
          default: "foo bar foo"
        },
        {
          name: "term",
          shadow: "text",
          field: "TEXT",
          default: "foo"
        },
        {
          name: "res",
          shadow: "text",
          field: "TEXT",
          default: "baz"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_toUpperLowerCase",
    spec: "%1 to %2",
    inputs: [
      "%s",
      "%m.OPTION"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "TEXT",
          shadow: "text",
          field: "TEXT",
          default: "Hello"
        },
        {
          name: "OPTION",
          type: "field",
          default: "upper"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_readLineInMultilineText",
    spec: "line %1 of %2",
    inputs: [
      "%n",
      "%s"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "LINE",
          shadow: "math_number",
          field: "NUM",
          default: "1"
        },
        {
          name: "TEXT",
          shadow: "text",
          field: "TEXT",
          default: "Hello"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_stringify",
    spec: "%1 as text",
    inputs: [
      "%s"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "ONE",
          shadow: "text",
          field: "TEXT",
          default: "apple"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_boolify",
    spec: "%1 as true or false",
    inputs: [
      "%s"
    ],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        {
          name: "ONE",
          shadow: "text",
          field: "TEXT",
          default: "true"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_character_to_code",
    spec: "code of letter %1",
    inputs: [
      "%s"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "ONE",
          shadow: "text",
          field: "TEXT",
          default: "a"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_code_to_character",
    spec: "letter with code %1",
    inputs: [
      "%n"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "ONE",
          shadow: "math_number",
          field: "NUM",
          default: "97"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_advlog",
    spec: "log base %1 of %2",
    inputs: [
      "%n",
      "%n"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "NUM1",
          shadow: "math_number",
          field: "NUM",
          default: "2"
        },
        {
          name: "NUM2",
          shadow: "math_number",
          field: "NUM",
          default: "8"
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_nand",
    spec: "%1 nand %2",
    inputs: [
      "%b",
      "%b"
    ],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        {
          name: "OPERAND1",
          type: "input",
          default: ""
        },
        {
          name: "OPERAND2",
          type: "input",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_nor",
    spec: "%1 nor %2",
    inputs: [
      "%b",
      "%b"
    ],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        {
          name: "OPERAND1",
          type: "input",
          default: ""
        },
        {
          name: "OPERAND2",
          type: "input",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_xnor",
    spec: "%1 xnor %2",
    inputs: [
      "%b",
      "%b"
    ],
    shape: "boolean",
    category: "operators",
    xml: {
      args: [
        {
          name: "OPERAND1",
          type: "input",
          default: ""
        },
        {
          name: "OPERAND2",
          type: "input",
          default: ""
        }
      ]
    },
    advanced: true
  },
  {
    id: "operator_regexmatch",
    spec: "matches of %1 with regex %2 flags %3",
    inputs: [
      "%s",
      "%s",
      "%s"
    ],
    shape: "reporter",
    category: "operators",
    xml: {
      args: [
        {
          name: "text",
          shadow: "text",
          field: "TEXT",
          default: "foo bar"
        },
        {
          name: "reg",
          shadow: "text",
          field: "TEXT",
          default: "[a-z]+"
        },
        {
          name: "regrule",
          shadow: "text",
          field: "TEXT",
          default: "g"
        }
      ]
    },
    advanced: true
  },
  {
    id: "data_reverselist",
    spec: "reverse %1",
    inputs: [
      "%m.list"
    ],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list"
        }
      ]
    },
    advanced: true
  },
  {
    id: "data_shiftlist",
    spec: "shift %1 by %2",
    inputs: [
      "%m.list",
      "%n"
    ],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list"
        },
        {
          name: "INDEX",
          shadow: "math_integer",
          field: "NUM",
          default: "1"
        }
      ]
    },
    advanced: true
  },
  {
    id: "data_arraylist",
    spec: "set %1 to array %2",
    inputs: [
      "%m.list",
      "%s"
    ],
    shape: "stack",
    category: "data",
    xml: {
      args: [
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list"
        },
        {
          name: "VALUE",
          shadow: "text",
          field: "TEXT",
          default: "[\"a\", \"b\", \"c\"]"
        }
      ]
    },
    advanced: true
  },
  {
    id: "data_listforeachitem",
    spec: "for each item %1 in %2",
    inputs: [
      "%m.var",
      "%m.list"
    ],
    shape: "c-block",
    category: "data",
    xml: {
      args: [
        {
          name: "VARIABLE",
          type: "field",
          default: "my variable",
          variableType: ""
        },
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list"
        }
      ]
    },
    advanced: true
  },
  {
    id: "data_listforeachnum",
    spec: "for each index %1 in %2",
    inputs: [
      "%m.var",
      "%m.list"
    ],
    shape: "c-block",
    category: "data",
    xml: {
      args: [
        {
          name: "VARIABLE",
          type: "field",
          default: "my variable",
          variableType: ""
        },
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list"
        }
      ]
    },
    advanced: true
  },
  {
    id: "data_amountinlist",
    spec: "number of %1 in %2",
    inputs: [
      "%s",
      "%m.list"
    ],
    shape: "reporter",
    category: "data",
    xml: {
      args: [
        {
          name: "VALUE",
          shadow: "text",
          field: "TEXT",
          default: "thing"
        },
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list"
        }
      ]
    },
    advanced: true
  },
  {
    id: "data_itemexistslist",
    spec: "item %1 exists in %2 ?",
    inputs: [
      "%n",
      "%m.list"
    ],
    shape: "boolean",
    category: "data",
    xml: {
      args: [
        {
          name: "INDEX",
          shadow: "math_integer",
          field: "NUM",
          default: "1"
        },
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list"
        }
      ]
    },
    advanced: true
  },
  {
    id: "data_listisempty",
    spec: "is %1 empty?",
    inputs: [
      "%m.list"
    ],
    shape: "boolean",
    category: "data",
    xml: {
      args: [
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list"
        }
      ]
    },
    advanced: true
  },
  {
    id: "data_listarray",
    spec: "%1 as array",
    inputs: [
      "%m.list"
    ],
    shape: "reporter",
    category: "data",
    xml: {
      args: [
        {
          name: "LIST",
          type: "field",
          default: "my list",
          variableType: "list"
        }
      ]
    },
    advanced: true
  },
  {
    id: "control_try_catch",
    spec: "try to do",
    inputs: [],
    shape: "c-block",
    category: "control",
    secondBranch: "if a block errors",
    xml: {
      args: []
    },
    advanced: true
  }
];
