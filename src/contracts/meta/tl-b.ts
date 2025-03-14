import util from 'util';
import { ast, NodeVisitor, ASTRootBase } from "@ton-community/tlb-parser";

class TestVisitor extends NodeVisitor {
  public visited: { [key: string]: number };

  constructor() {
    super();
    this.visited = {};
  }

  override genericVisit(node: ASTRootBase): void {
    if (this.visited[node.constructor.name] === undefined) {
      this.visited[node.constructor.name] = 0;
    }

    this.visited[node.constructor.name] += 1;
    return super.genericVisit(node);
  }
}

const scheme = `
swap#6664de2a 
token_wallet1:MsgAddress 
refund_address:MsgAddress // Comment
excesses_address:MsgAddress 
tx_deadline:uint64 
cross_swap_body:^[
    min_out:Coins 
    receiver:MsgAddress 
    fwd_gas:Coins 
    custom_payload:(Maybe ^Cell) 
    refund_fwd_gas:Coins 
    refund_payload:(Maybe ^Cell) 
    ref_fee:uint16 
    ref_address:
MsgAddress] = DexPayload;
`;

const tree = ast(scheme);
const visitor = new TestVisitor();
visitor.visit(tree);

console.log(
  util.inspect(
    visitor.visited,
    {showHidden: false, depth: null, colors: true},
  ),
);

console.log(
  util.inspect(
    tree,
    {showHidden: false, depth: null, colors: true},
  ),
);