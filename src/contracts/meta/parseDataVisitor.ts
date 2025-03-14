import { Cell, Slice } from "@ton/core";
import { ContractMessageMeta, MetaMessage, MetaMessageField, MetaPredicate, StructureVisitor } from "./structureVisitor";
import { ContractOpcodes, OpcodesLookup } from "../../wrappers/opCodes";


export class ParseDataVisitor implements StructureVisitor {

    result : ContractMessageMeta[]  = []
    slices : (Slice | null) [] = []

    skipFields : boolean = false;

    currentSlice() : Slice | null {
        return this.slices[this.slices.length - 1]
    }

    visitCell(cell : Cell, acceptor: any) : Slice {
        this.slices.push(cell.beginParse())
        acceptor(this)
        return this.slices.pop() as Slice
    }

    visitField(field: MetaMessageField): void {
        if (this.skipFields)
            return

        let workSlice = this.currentSlice()
        if (workSlice == null)
            return


        let value: string = ""
        if (field.type == "Uint") {
            value = workSlice.loadUintBig(field.size).toString()
        }
        if (field.type == "Int") {
            value = workSlice.loadIntBig(field.size).toString()
        }
        if (field.type == "Address") {
            let address = workSlice.loadAddressAny()
            if (address != null)
                value = address.toString()
            else 
                value = "addr_none"
        }
        if (field.type == "Coins") {
            value = workSlice.loadCoins().toString()
        }
        if (field.type == "Cell") {
            if (field.meta.includes("Maybe")) {
                let cell = workSlice.loadMaybeRef()
                if (cell == null)
                    value = "";
                else
                    value = cell.toBoc().toString('hex')
            } else {
                value = workSlice.loadRef().toBoc().toString('hex')
            }
        }

        this.result.push({
            name : field.name,
            value: value,
            type : field.type.toString() + "("+field.size+")" + (field.meta != "" ? "," + field.meta : ""),
            comment : field.comment
        })
    }

    enterCell(opts: { name: string; type?: "Maybe" | "IfExists" | "" }): void {
        if (this.skipFields)
            return

        let workSlice = this.currentSlice()
        if (workSlice == null)
            return

        if (opts.type && opts.type == "Maybe") {
            const subcell = workSlice.loadMaybeRef();
            if (subcell != null) {
                this.slices.push(subcell.beginParse()) 
            } else {
                this.slices.push(null) 
            }
        } else if (opts.type && opts.type == "IfExists") {
            if (workSlice.remainingRefs > 0) {
                const subcell = workSlice.loadRef();
                this.slices.push(subcell.beginParse())
            } else {
                this.slices.push(null) 
            }
        } else
        {
            this.slices.push(workSlice.loadRef().beginParse())
        }
    }
    leaveCell(opts: { name: string; }): void {
        this.slices.pop()
    }

    predicateStart(predicate : MetaPredicate) : void
    {
        let predicateValue = false;
        let arg1 
        let arg2 = (typeof predicate.arg2 === "number") ? predicate.arg2 : undefined

        for (let field of this.result) 
        {
            if (field.name == predicate.arg1) {
                arg1 = Number(field.value)
            }
           
            if (arg2 === undefined && field.name == predicate.arg2) {
                arg2 = Number(field.value)
            }
        }

        if (predicate.action == "=") {
            predicateValue = (arg1  == arg2)
        }

        if (!predicateValue) {
            this.skipFields = true;
        }

        console.log("Predicate ", predicate, " evaluated to ", predicateValue)

    }
    predicateEnd  () : void
    {
        this.skipFields = false;
    }

}


