import { useState } from "react";
import { Wallet, KeyRound, LogOut, Lock, Plug, Sparkles } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import { Button, CopyButton, HelperText, Input, Label, Modal } from "./ui";
import { fromWei, NATIVE_SYMBOL, shortAddress } from "../lib/format";
import { activeNetworkLabel } from "../lib/networks";
import { mobileWalletLinks } from "../lib/injectedWallets";

type View = "closed" | "choose" | "create" | "import" | "unlock" | "account" | "export";

/** Header wallet button. Adapts to the state: no wallet, locked built-in wallet, or connected account. */
export function WalletPanel() {
  const wallet = useWallet();
  const toast = useToast();
  const [view, setView] = useState<View>("closed");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);

  const close = () => {
    setView("closed");
    setPassword("");
    setPassword2("");
    setKeyInput("");
    setRevealed(null);
    wallet.clearError();
  };

  const submitCreate = async () => {
    if (password !== password2) {
      toast.push("error", "Passwords do not match.");
      return;
    }
    try {
      await wallet.createBurnerWallet(password);
      toast.push("success", "Wallet created on this device");
      close();
    } catch {
      /* shown in wallet.error */
    }
  };

  const submitImport = async () => {
    try {
      await wallet.importBurnerWallet(keyInput, password);
      toast.push("success", "Wallet imported");
      close();
    } catch {
      /* shown in wallet.error */
    }
  };

  const submitUnlock = async () => {
    try {
      await wallet.unlock(password);
      toast.push("success", "Wallet unlocked");
      close();
    } catch {
      /* shown in wallet.error */
    }
  };

  const connectBrowser = async (id?: string, name?: string) => {
    try {
      await wallet.connectInjected(id);
      toast.push("success", `${name ?? "Browser wallet"} connected`);
      close();
    } catch {
      /* shown in wallet.error */
    }
  };

  const errorLine = wallet.error ? <HelperText tone="error">{wallet.error}</HelperText> : null;

  // ---- Not connected ----
  if (wallet.mode === "none") {
    return (
      <>
        <Button icon={<Wallet className="h-4 w-4" />} onClick={() => setView("choose")}>
          Connect wallet
        </Button>
        {view === "choose" && (
          <Modal title="Connect a wallet" onClose={close}>
            <div className="space-y-3">
              <button onClick={() => setView("create")} className="flex w-full items-center gap-3 rounded-md border border-deep-600 p-3 text-left hover:border-beacon-400">
                <Sparkles className="h-5 w-5 shrink-0 text-beacon-400" />
                <span>
                  <span className="block text-[14px] font-medium text-mist-100">Create a built-in wallet</span>
                  <span className="block text-[12px] text-mist-500">A fresh address, encrypted with a password on this device.</span>
                </span>
              </button>
              <button onClick={() => setView("import")} className="flex w-full items-center gap-3 rounded-md border border-deep-600 p-3 text-left hover:border-beacon-400">
                <KeyRound className="h-5 w-5 shrink-0 text-beacon-400" />
                <span>
                  <span className="block text-[14px] font-medium text-mist-100">Import a private key</span>
                  <span className="block text-[12px] text-mist-500">Use a testnet key you already have.</span>
                </span>
              </button>
              <div className="rounded-md border border-deep-600 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Plug className="h-5 w-5 text-beacon-400" />
                  <span className="text-[14px] font-medium text-mist-100">Browser wallet</span>
                </div>
                <p className="mb-2 text-[12px] text-mist-500">
                  Works with any EVM wallet. The app will ask it to switch to {activeNetworkLabel}.
                </p>
                {wallet.injectedWallets.length === 0 ? (
                  <button onClick={() => void connectBrowser()} className="w-full rounded-md border border-deep-600 px-3 py-2 text-left text-[13px] text-mist-200 hover:border-beacon-400">
                    Detect wallets
                  </button>
                ) : (
                  <div className="space-y-2">
                    {wallet.injectedWallets.map((w) => (
                      <button key={w.id} onClick={() => void connectBrowser(w.id, w.name)} className="flex w-full items-center gap-3 rounded-md border border-deep-600 px-3 py-2 text-left text-[13px] text-mist-100 hover:border-beacon-400">
                        {w.icon ? <img src={w.icon} alt="" className="h-5 w-5 rounded" /> : <Plug className="h-5 w-5 text-beacon-400" />}
                        {w.name}
                      </button>
                    ))}
                  </div>
                )}
                {wallet.injectedWallets.length === 0 && (
                  <div className="mt-3 border-t border-deep-700 pt-3">
                    <p className="text-[12px] text-mist-500">On a phone? Open this page inside your wallet app:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mobileWalletLinks().map((l) => (
                        <a key={l.name} href={l.href} className="rounded-full border border-deep-600 px-3 py-1 text-[12px] text-mist-200 hover:border-beacon-400">
                          {l.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {errorLine}
            </div>
          </Modal>
        )}
        {view === "create" && (
          <Modal title="Create a built-in wallet" onClose={close}>
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-mist-400">
                The key is generated in this browser and stored encrypted with your password. Use it for testnets only.
              </p>
              <div>
                <Label>Password (6+ characters)</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
              <div>
                <Label>Repeat password</Label>
                <Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
              </div>
              {errorLine}
              <Button loading={wallet.isBusy} onClick={submitCreate} disabled={!password}>Create wallet</Button>
            </div>
          </Modal>
        )}
        {view === "import" && (
          <Modal title="Import a private key" onClose={close}>
            <div className="space-y-4">
              <div>
                <Label>Private key</Label>
                <Input className="font-mono" type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="0x…" autoComplete="off" />
              </div>
              <div>
                <Label>Password to encrypt it (6+ characters)</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
              {errorLine}
              <Button loading={wallet.isBusy} onClick={submitImport} disabled={!keyInput || !password}>Import wallet</Button>
            </div>
          </Modal>
        )}
      </>
    );
  }

  // ---- Built-in wallet stored but locked ----
  if (wallet.mode === "burner-locked") {
    return (
      <>
        <Button variant="secondary" icon={<Lock className="h-4 w-4" />} onClick={() => setView("unlock")}>
          Unlock {shortAddress(wallet.lockedAddress)}
        </Button>
        {view === "unlock" && (
          <Modal title="Unlock your wallet" onClose={close}>
            <div className="space-y-4">
              <div>
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              {errorLine}
              <div className="flex gap-2">
                <Button loading={wallet.isBusy} onClick={submitUnlock} disabled={!password}>Unlock</Button>
                <Button variant="ghost" onClick={() => { wallet.forgetBurnerWallet(); close(); }}>Forget this wallet</Button>
              </div>
            </div>
          </Modal>
        )}
      </>
    );
  }

  // ---- Connected (built-in or browser wallet) ----
  return (
    <>
      <Button variant="secondary" onClick={() => setView("account")}>
        <span className="font-mono text-[13px]">{shortAddress(wallet.address)}</span>
        {wallet.mode === "injected" && wallet.wrongNetwork && <span className="text-amber-300">•</span>}
      </Button>
      {view === "account" && wallet.address && (
        <Modal title="Account" onClose={close}>
          <div className="space-y-4">
            <div>
              <Label>Address</Label>
              <p className="break-all font-mono text-[13px] text-mist-100">{wallet.address}</p>
              <CopyButton value={wallet.address} label="Copy address" />
            </div>
            <div>
              <Label hint={NATIVE_SYMBOL}>Balance</Label>
              <p className="text-[14px] text-mist-100">
                {wallet.balanceWei === null ? "—" : fromWei(wallet.balanceWei, 4)} {NATIVE_SYMBOL}
              </p>
              <HelperText>Writes cost a little {NATIVE_SYMBOL} for gas. Keep some in this account.</HelperText>
            </div>
            <div>
              <Label>Connected with</Label>
              <p className="text-[13px] text-mist-300">
                {wallet.mode === "injected" ? wallet.injectedWalletName ?? "Browser wallet" : "Built-in wallet"}
              </p>
            </div>
            {wallet.mode === "burner-unlocked" && (
              <div className="border-t border-deep-700 pt-4">
                {revealed ? (
                  <>
                    <Label>Private key (keep it secret)</Label>
                    <p className="break-all rounded-md border border-deep-600 bg-deep-950 p-3 font-mono text-[12px] text-mist-200">{revealed}</p>
                    <CopyButton value={revealed} label="Copy key" />
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => setRevealed(wallet.exportPrivateKey())}>Show private key</Button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-deep-700 pt-4">
              {wallet.mode === "burner-unlocked" && (
                <Button variant="secondary" icon={<Lock className="h-4 w-4" />} onClick={() => { wallet.lock(); close(); }}>
                  Lock
                </Button>
              )}
              {wallet.mode === "injected" && (
                <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => { wallet.disconnectInjected(); close(); }}>
                  Disconnect
                </Button>
              )}
              {wallet.mode === "burner-unlocked" && (
                <Button variant="danger" onClick={() => { wallet.forgetBurnerWallet(); close(); }}>
                  Forget this device's wallet
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
