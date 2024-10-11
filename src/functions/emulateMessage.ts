import { Api } from 'tonapi-sdk-js';
import {
  Address,
  beginCell,
  Cell,
  external,
  internal,
  SenderArguments,
  SendMode,
  storeMessage,
} from '@ton/ton';
import { sign } from '@ton/crypto';
import { WalletVersion } from '../types/WalletVersion';
import { WalletContract, WalletContracts } from '../contracts/WalletContract';

const signer = async (message: Cell): Promise<Buffer> =>
  sign(message.hash(), Buffer.alloc(64));

const externalMessage = (
  contract: WalletContracts,
  seqno: number,
  body: Cell
) =>
  beginCell()
    .storeWritable(
      storeMessage(
        external({
          to: contract.address,
          init: seqno === 0 ? contract.init : undefined,
          body: body,
        })
      )
    )
    .endCell();

export async function emulateMessage(
  client: Api<unknown>,
  messages: SenderArguments[] | undefined,
  wallet: string | null,
  walletPubKey: string | null,
  walletVersion: WalletVersion | undefined
) {
  if (
    !wallet ||
    !messages ||
    !messages[0].body ||
    !walletVersion ||
    !walletPubKey
  )
    return;
  const walletContract = WalletContract.create(
    Address.parse(wallet).workChain,
    Buffer.from(walletPubKey, 'hex'),
    walletVersion
  );

  const seqno = (await client.wallet.getAccountSeqno(wallet)).seqno;

  const secretKey = await signer(messages[0].body);

  /* replace secretKey by signer if @ton/ton ver. ^14.0.0 */
  const transfer = await walletContract.createTransfer({
    seqno,
    signer,
    secretKey,
    timeout: 0,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    messages: messages.map(message =>
      internal({
        to: message.to,
        bounce: true,
        value: message.value,
        init: {
          code: message.init?.code ?? null,
          data: message.init?.data ?? null,
        },
        body: message.body,
      })
    ),
  });

  const msgCell = externalMessage(
    walletContract as WalletContracts,
    seqno,
    transfer
  ).toBoc({
    idx: false,
  });

  const emulation = await client.wallet.emulateMessageToWallet({
    boc: msgCell.toString('base64'),
  });

  return emulation;
}
