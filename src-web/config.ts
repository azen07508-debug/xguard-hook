import type { EIP1193Provider } from 'viem';
import { defineChain } from 'viem';
import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';

type InjectedProvider = EIP1193Provider & {
  ethereum?: InjectedProvider;
  isOKExWallet?: true;
  isOkxWallet?: true;
  providers?: InjectedProvider[];
};

type WalletWindow = Window & {
  ethereum?: InjectedProvider;
  okxwallet?: InjectedProvider;
  okxWallet?: InjectedProvider;
};

export const xLayer = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_XLAYER_RPC_URL ?? 'https://rpc.xlayer.tech'] },
  },
  blockExplorers: {
    default: { name: 'OKLink', url: 'https://www.oklink.com/xlayer' },
  },
});

export const wagmiConfig = createConfig({
  chains: [xLayer],
  connectors: [
    injected({
      target: {
        id: 'okxWallet',
        name: 'OKX Wallet',
        provider(window) {
          const walletWindow = window as WalletWindow | undefined;
          const okxWallet = walletWindow?.okxwallet ?? walletWindow?.okxWallet;
          const directProvider = okxWallet?.ethereum ?? okxWallet;
          if (directProvider?.request) return directProvider;

          const ethereum = walletWindow?.ethereum;
          if (ethereum?.providers) {
            return ethereum.providers.find(
              (provider: InjectedProvider) => provider.isOkxWallet || provider.isOKExWallet,
            );
          }
          if (ethereum?.isOkxWallet || ethereum?.isOKExWallet) return ethereum;
          return undefined;
        },
      },
      unstable_shimAsyncInject: 1_500,
    }),
    injected({ unstable_shimAsyncInject: 1_500 }),
  ],
  transports: {
    [xLayer.id]: http(import.meta.env.VITE_XLAYER_RPC_URL ?? 'https://rpc.xlayer.tech'),
  },
});
