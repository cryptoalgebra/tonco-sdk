import { Cell } from '@ton/core';

const INIT_CODE_HEX = {
  pool:
    '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',
  account:
    'te6cckECCQEAAZcAART/APSkE/S88sgLAQIBYgIIA/bQ7aLt+zIhxwCSXwPg0NMD7UTQ+kAB+GH6QAH4YtQw0PoAAfhj+gAB+GT6AAH4ZfoAMPhmAXGwkl8D4PpAMAHTH9M/+EJSQMcFkVvjDfhBEscFjqKCEEKg+0O6jpcgggiYloC88uBTggiYloCh+EFw2zzbMeAwkVvihA8DBgcC7iKCED6+VDG6j2tsMvoA+gD6APoA03/SF9IXMPhDUAeg+GP4RFAFoPhkAvhl+GYgwgD4Q/hFvrD4RPhGvrCOsoIQgXAu+MjLHxTLP/hD+gL4RPoC+EHPFhPLfxLKF8oXyfhCAds8cPhjcPhkcPhlcPhmkl8E4uBbBAUALHGAGMjLBVADzxZw+gISy2rMyYMG+wAAQsj4Q/oC+ET6AvhF+gL4RvoCycj4Qc8W+ELPFszJ7VTbMQAocIAYyMsFUAPPFlAD+gLLaskB+wAABPLwAGWgonPaiaH0gAPww/SAA/DFqGGh9AAD8Mf0AAPwyfQAA/DL9ABh8M3wg/CF8IfwifCL8I1yF1OB',
  positionnft:
    'te6cckECGAEAA6gAART/APSkE/S88sgLAQIBYgIQAgLMAw0CAUgEDAL1QyIccAkl8D4NDTAwFxsJJfA+D6QPpAMfoAMXHXIfoAMfoAMHOptADwCwLTH9M/IoIQ1ezKKrqOLjRbMvhCWMcF8uGV+kAB+GPTfwH4ZdIXAfhm0hcB+GfUMNDT/wH4aNP/MPhp8AzgIoIQX8w9FLrjAjQ0ghBGyjNauoBQgCsDL4QxPHBfLhkfpA+kDSADH6AHAkgQFNAfpEMFi68vQg10nCAPLixAaCCvrwgKEhlFMVoKHeItcLAcMAIJIGoZE24iDC//LhkiGSNjDjDQOSbDHjDfhj8AwGBwB6ghAFE42RyPhDzxZQCM8WcSUESRNUR6BwgBDIywVQB88WUAX6AhXLahLLH8s/Im6zlFjPFwGRMuIByQH7AAB8cCOBAU0B+kQwWLry9BOCENUydttQBG1xcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wABEOMCXwOED/LwCQH+AfpA03/SF9IX1DDQ0//T/zD4QhfHBfLgUvhDFccF8uGR+EYSuvLhmfhHuvLhmfhFwADy0Zj4RQG2CCHIy/9SMMv/yfhJ+EjIy//L/8n4R/hG+EX4QYIQ1zrAncjLHxrLP/hDzxYZyz8Yy38XyhcWyhdSIMt/FcwUzMn4RVAEoQoBMvhl+Gj4aYBA+EXAAJMwgwbecPhCWts88AwLACxxgBjIywVQBM8WUAT6AhLLaszJAfsAAG9CDEmDCLNuYW6M8WjiltIcEAmYAtUAPLBwGjWN6cAXqpDKYwWG8CIcAA5jGYbyICywchbhLmMOKAIBIA4PAGX3aiaGmfgPww/SAA/DF9IAD8MeoA/DJpv4D8MukLgPwzaQuA/DPqGGhp/4D8NGn/mHw0wAVdfCT8JGRl/+X/5Pwj/CN8IvwifCDkZZ/8IWeLfCHni2Zlv+UL5QvmZPaqQCASARFAIBIBITAB24o48Av4RfhG+Ef4SPhJgADbnhnwC/hDgCASAVFwH7uPz/AL+ETQ0wcx9AQwcMjLB4v0xQIFBvc2l0aW9uOiBbIIzxb4RvACi0IC0+IIzxb4R/ACizIF0gjPFvhF8ALJcMjLB8yC8MkEb3o3rQ6nzuczVZhPpUKJgvizfI97zskfescafNEEWIMH9EP4SfhI+Ef4RvhFcMjLBxb0AIFgA2Fct/FMoXE8oXEsv/y//J+EXDAPhB+EL4Q1UDAA26jC8Av4Qo1pT9oA==',
};

export const ACCOUNTV3_CODE = Cell.fromBase64(INIT_CODE_HEX.account);
export const POSITIONV3_CODE = Cell.fromBase64(INIT_CODE_HEX.positionnft);
export const POOLV3_CODE = Cell.fromBase64(INIT_CODE_HEX.pool);
