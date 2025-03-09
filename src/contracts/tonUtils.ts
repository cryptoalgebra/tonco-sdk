import { Address } from "@ton/core"

export const BLACK_HOLE_ADDRESS  : Address = Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c")
export const BLACK_HOLE_ADDRESS1 : Address = Address.parse("EQAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEOSs")
export const BLACK_HOLE_ADDRESS2 : Address = Address.parse("EQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAc3j")


export function getDailyStorageFees(bits: bigint, cells: bigint )
{
    const STORE_BIT_PRICE  = 1n
    const STORE_CELL_PRICE = 500n
    let storageDayFee = (BigInt(bits) * STORE_BIT_PRICE + BigInt(cells) * STORE_CELL_PRICE) * (60n * 60n * 24n) / (2n ** 16n)
    return storageDayFee;
}



export function addrToShard(input : Address) : number {
    return input.hash.readUInt16BE(0);
}

export function matchingBits16(v1 : number, v2: number) {
    for (let i = 1; i <= 16; i++) {
        let mask = 1 << (16 - i)
        if ((v1 & mask) != (v2 & mask)) {
            return i - 1
        }
    }
    return 0
}
