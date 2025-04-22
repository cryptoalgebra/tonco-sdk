import { poolv3ContractCellToConfig as poolv2ContractCellToConfig } from '../contracts/v2';
import { RouterVersion } from '../types/RouterVersion';

export const poolContractCellToConfig = {
  [RouterVersion.v1]: poolv2ContractCellToConfig,
  [RouterVersion.v2]: poolv2ContractCellToConfig,
};
