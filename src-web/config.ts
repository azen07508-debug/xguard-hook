import { defineChain } from 'viem';
import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';

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
  connectors: [injected()],
  transports: {
    [xLayer.id]: http(import.meta.env.VITE_XLAYER_RPC_URL ?? 'https://rpc.xlayer.tech'),
  },
});
