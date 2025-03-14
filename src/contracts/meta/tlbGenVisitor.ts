import { OpcodesLookup } from "../../wrappers/opCodes";
import { MetaMessage, MetaMessageField, MetaPredicate, StructureVisitor } from "./structureVisitor";

export class TLBGenVisitor implements StructureVisitor {
   
    result : string[] = []
    indentation : string  = "    "


    isMaybe : boolean = false

    visitMetaMessage(name: string, metaMessage: MetaMessage ) {
        let opcodeName = OpcodesLookup[metaMessage.opcode];
        if (metaMessage.name)
            opcodeName = metaMessage.name
        this.result.push(`${opcodeName}#${metaMessage.opcode.toString(16)} `)
        metaMessage.acceptor(this)
        this.result.push(`= ${name}Messages;`)
        

    }
 
    visitCell(acceptor: any) {      
        
    }

    visitField(field: MetaMessageField): void {
        if (field.meta.includes("op")) {
            return
        }

        let tlbType: string = ""
        if (field.type == "Uint") {
            tlbType = "uint" + (field.size).toString()
        }
        if (field.type == "Int") {
            tlbType = "int" + (field.size).toString()
        }
        if (field.type == "Address") {
            tlbType = "MsgAddress"
        }
        if (field.type == "Coins") {
            tlbType = "(VarUInteger 16)"
        }

        if (field.type == "Cell") {
            if        (field.meta.includes("Maybe"))  {
                tlbType = "(Maybe ^Cell)"
            } else if (field.meta.includes("Either")) {
                tlbType = "(Either ^Cell Cell)"
            } else {
                tlbType = "Cell"
            }
        }
        this.result.push(this.indentation + `${field.name}:${tlbType}`)
    }

    enterCell(opts: { name: string; type? : "Maybe" | "IfExists" | "" }): void {
        this.isMaybe = (opts.type == "Maybe")

        this.result.push(this.indentation + `${opts.name}:${this.isMaybe ? "(Maybe " : ""}^[`)
        this.indentation += "    "
    }
    leaveCell(opts: { name: string; }): void {
        this.indentation = this.indentation.substring(0, this.indentation.length - 4)
        this.result.push(this.indentation +  `] ${this.isMaybe ? ")" : ""} `)
    }

    getResult() : string {
        return this.result.join("\n");
    }

    predicateStart(predicate : MetaPredicate) : void 
    {
        let textPredicate = `${predicate.arg1} ${predicate.action} ${predicate.arg2}`
        this.result.push(this.indentation + `(${textPredicate})?(`)
        this.indentation += "    "
    }

    predicateEnd  () : void {
        this.indentation = this.indentation.substring(0, this.indentation.length - 4)
        this.result.push(this.indentation + `)`)
    }

}
