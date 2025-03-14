import { Address, Cell } from "@ton/core";

export type ContractMessageMeta = {name: string, value: string, type:string, comment? : string }

export type MetaMessage = {
    opcode : number,
    access? : "private"
    name? : string,
    description : string, 
    rights? : string, 
    acceptor : (visitor: StructureVisitor) => void
}

export type MetaMessageField = {
    name: string,
    type: "Uint" | "Int" | "Address" | "Coins" | "Cell", 
    size: number, 
    meta: string, 
    comment: string
}

export type MetaPredicate = {
    action: "=" | "<" | ">"
    arg1 : string
    arg2 : string | number
}

export interface StructureVisitor {
    /* Base TON types */
    visitField  (field: MetaMessageField ): void;
    enterCell(opts:{name: string, type?: "Maybe" | "IfExists" | "", comment? : string}) : void;
    leaveCell(opts:{name? : string}) : void;

    predicateStart(predicate : MetaPredicate) : void;
    predicateEnd  () : void;
}

