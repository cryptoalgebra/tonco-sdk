import { poolv3ContractConfigToCell as poolv1ContractConfigToCell } from '../contracts/v1';
import { poolv3ContractConfigToCell as poolv2ContractConfigToCell } from '../contracts/v2';
import { RouterVersion } from '../types/RouterVersion';

export const poolContractConfigToCell = {
  [RouterVersion.v1]: poolv1ContractConfigToCell,
  [RouterVersion.v2]: poolv2ContractConfigToCell,
};
