import { fromNano, Transaction } from "@ton/core";
import colors from "colors/safe"
import CliTable3 from "cli-table3";
import { ErrorsLookup, OpcodesLookup } from "./opCodes";


const decimalCount = 9;
const decimal = pow10(decimalCount);

function pow10(n: number): bigint {
    let v = 1n;
    for (let i = 0; i < n; i++) {
        v *= 10n;
    }
    return v;
}

export function formatCoinsPure(value: bigint, precision = 6): string {
    let whole = value / decimal;

    let frac = value % decimal;
    const precisionDecimal = pow10(decimalCount - precision);
    if (frac % precisionDecimal > 0n) { // round up
        frac += precisionDecimal;
        if (frac >= decimal) {
            frac -= decimal;
            whole += 1n;
        }
    }
    frac /= precisionDecimal;

    return `${whole.toString()}${frac !== 0n ? ('.' + frac.toString().padStart(precision, '0').replace(/0+$/, '')) : ''}`;
}

function formatCoins(value: bigint | undefined, precision = 9, suffix: boolean = true): string {
    if (value === undefined) return 'N/A';

    return formatCoinsPure(value, precision) + (suffix ? ' TON' : "");
}

function formatCoins1(value: bigint | undefined ) : string {
    if (value === undefined) 
        return "N/A"

    const divisor = BigInt(10 ** 9);
    const integerPart = value / divisor;
    let fractionalPart = (value % divisor).toString(10).padStart(9, '0');

    let result: string = integerPart.toString() + ".";
    result += fractionalPart.substring(0,3) + "`" + fractionalPart.substring(3,6) + "`" + fractionalPart.substring(6,9)

    return (result)

}

const defaultActionErrorCodes = {

}

//const tst : {[ key:number ] : string } = { -1 : "5" }


const defaultExitErrorCodes : {[ key:number ] : string } = {
    "0": "Ok",                   // Compute Phase	Standard successful execution exit code.
    "1": "Alternative OK",       // Compute Phase	Alternative successful execution exit code.
    "4": "Int overflow or div0", // Compute Phase    Integer does not fit into −2^256 ≤ x < 2^256 or a division by zero has occurred.

    "7": "Type check error",     // Compute Phase	Type check error. An argument to a primitive is of an incorrect value type. 1

    "8": "Cell overflow",        // Compute Phase	 Writing to builder is not possible since after operation there would be more than 1023 bits or 4 references.

    "9": "Cell underflow",       // Compute Phase    Read from slice primitive tried to read more bits or references than there are.
    "5": "Integer out of range", // Compute Phase	Integer out of expected range.
   "35": "Invalid outbound src addr",     // Action Phase	Invalid Source address in the outbound message.

  "-14": "Out of gaz"           // Compute Phase	It means out of gas error, same as 13. Negative, because it cannot be faked
}

/*
function transationDepth(q : number, transactions: Transaction[]) : number {
    let depth = 0;
    let tx : Transaction = transactions[q];
    let ph = tx.prevTransactionHash

    for (let n = 0; n < q ; n++)
        if (transactions[n].hash == ph) {
            depth = transationDepth(n, transactions)
        }
    return depth
}   
*/
/**
 *  It's obiously heavily based on printTransactionFees. But a bit more detailed
 * 
 * 
 * 
 * */

export function printTransactionPretty(
    transactions: Transaction[], 
    addresses : {[key: string] : string} = {},                             // Dict for address decoding
    operations: {[key: number ]: string} = OpcodesLookup,   // Dict for op decoding
    actionErrors : {[key: number ]: string} = defaultActionErrorCodes,
    exitErrors   : {[key: number ]: string} | null = null        
    ) {

    if (exitErrors == null) {
        exitErrors = {...defaultExitErrorCodes, ...ErrorsLookup}
    }

    let data = []
    
    let totalFeeAll   : bigint = 0n;
    let computeFeeAll : bigint = 0n;

    for(const [index, tx] of transactions.entries()) {
        
        if (tx.description.type !== 'generic') return undefined;

        const body = tx.inMessage?.info.type === 'internal' ? tx.inMessage?.body.beginParse() : undefined;

        /* Process the op  */
        let opText : string = 'N/A'
        
        if (body !== undefined) {
            if (body.remainingBits < 32) {
                opText = 'no body';
            } else { 
                const opCode = body.preloadUint(32)
                if (opCode in operations) {
                    opText = operations[opCode]
                } else {
                    opText = '0x' + opCode.toString(16)
                }      
            }
        }
        totalFeeAll += tx.totalFees.coins;
        const totalFees = formatCoins1(tx.totalFees.coins);

        const computeFeeNum = tx.description.computePhase.type === 'vm' ? tx.description.computePhase.gasFees : 0n
        computeFeeAll += computeFeeNum;
        const computeFees = formatCoins1(tx.description.computePhase.type === 'vm' ? tx.description.computePhase.gasFees : undefined);

        const totalFwdFees = formatCoins(tx.description.actionPhase?.totalFwdFees ?? undefined);

        const valueIn = formatCoins1(tx.inMessage?.info.type === 'internal' ? tx.inMessage.info.value.coins : undefined);

        const valueOut = formatCoins1(
            tx.outMessages
            .values()
            .reduce(
                (total, message) => total + (message.info.type === 'internal' ? message.info.value.coins : 0n),
                0n,
            )
        );

        const forwardIn = formatCoins(
            tx.inMessage?.info.type === 'internal' ? tx.inMessage.info.forwardFee : undefined,
        );

        let exitCodeText = "N/A"
        if (tx.description.computePhase.type === 'vm')
        {
            let exitCode = tx.description.computePhase.exitCode;
            if (exitCode in exitErrors) 
                exitCodeText = exitErrors[exitCode];
            else 
                exitCodeText  = exitCode.toString();
            
            if (exitCode != 0) {
                exitCodeText =  colors.magenta(exitCodeText);
            } else {
                exitCodeText =  colors.green(exitCodeText);
            }

        } 

        // const addrString = Address.parseRaw("0x" + tx.address.toString()).toString()
        let addrText = "N/A"            
        if (tx.inMessage) {
            const addr = tx.inMessage.info.dest?.toString()
            if (addr !== undefined) {
                if (addr in addresses) {
                    addrText = addresses[addr]
                } else {
                    addrText = addr.substring(0, 6)+ "..." +  addr.substring(addr.length - 6, addr.length)            
                }
            }
        }


        data.push({
            index, 
            addrText,
            opText, 
            valueIn,
            valueOut,
            totalFees: totalFees,
            inForwardFee: forwardIn,
            outForwardFee: totalFwdFees,
            outActions: tx.description.actionPhase?.totalActions ?? 'N/A',
            computeFee: computeFees,
            exitCode: exitCodeText,
            actionCode: tx.description.actionPhase?.resultCode ?? 'N/A',
        });
    }
        
    const table = new CliTable3({
        head:      ['Idx'  ,  'Dst', '  op', "ton in (TON)",  "ton out (TON)", "out actions",  "Total Fee TON", "Compute Fee TON", "exit Code", "action Code" ],
        colWidths: [      3,     20,     25,             16,               16,            10,               15,                15,         30,            18  ],
        colAligns: ['right', 'left', 'left',        'right',          'right',     'center' ,         'right' ,          'right' ,    'center',     'center'  ],
        style: { 'padding-left': 0, 'padding-right': 0  },
        chars: {'mid': '', 'left-mid': '', 'mid-mid': '', 'right-mid': ''}
        });

    data.forEach(row => table.push([row.index, row.addrText, row.opText, row.valueIn, row.valueOut, row.outActions, row.totalFees, row.computeFee, row.exitCode, row.actionCode]));

    // Print table
    console.log(table.toString());
    console.log(`All Compute Fees : ${colors.yellow(fromNano(computeFeeAll))} TON`);
    console.log(`All Total Fees   : ${colors.yellow(fromNano(totalFeeAll))} TON`);
    
    
   

}

export function hasErrors( transactions: Transaction[])
{
    return transactions.some(
        (tx : Transaction) => {
            if (tx.description.type !== 'generic') return undefined;

            if (tx.description.actionPhase?.resultCode != 0 )
                return true
            if (tx.description.computePhase.type === 'vm')
            {
                if (tx.description.computePhase.exitCode != 0)
                    return true
            }
        }
    )
}