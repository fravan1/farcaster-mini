import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

/**
 * Mini dApp (ethers v6) avec sélecteur de réseau + liens Etherscan dynamiques.
 * Réseaux gérés : Mainnet (0x1) et Sepolia (0xaa36a7 / 11155111).
 */

const CHAINS = {
  mainnet: {
    chainIdHex: "0x1",
    chainIdDec: 1,
    name: "Ethereum Mainnet",
    rpcUrls: ["https://rpc.ankr.com/eth"],
    blockExplorer: "https://etherscan.io",
    currency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  sepolia: {
    chainIdHex: "0xaa36a7",
    chainIdDec: 11155111,
    name: "Sepolia Testnet",
    rpcUrls: ["https://rpc.ankr.com/eth_sepolia"],
    blockExplorer: "https://sepolia.etherscan.io",
    currency: { name: "Sepolia Ether", symbol: "SEP", decimals: 18 },
  },
};

// Bytecode de test : déploie un contrat vide
const TEST_BYTECODE = "0x60006000f3";

export default function App() {
  const [account, setAccount] = useState(null);
  const [status, setStatus] = useState("");
  const [bytecode, setBytecode] = useState("");
  const [txHash, setTxHash] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [currentChainId, setCurrentChainId] = useState(null);
  const [target, setTarget] = useState("sepolia"); // valeur par défaut recommandée

  const targetCfg = CHAINS[target];

  // détecte le réseau courant si MetaMask est présent
  useEffect(() => {
    if (!window.ethereum) return;
    const handler = (hex) => setCurrentChainId(parseInt(hex, 16));
    window.ethereum
      .request({ method: "eth_chainId" })
      .then((hex) => handler(hex))
      .catch(() => {});
    // écoute changement de réseau
    const onChainChanged = (hex) => handler(hex);
    window.ethereum.on?.("chainChanged", onChainChanged);
    return () => window.ethereum.removeListener?.("chainChanged", onChainChanged);
  }, []);

  const explorerBase = useMemo(() => {
    if (currentChainId === CHAINS.sepolia.chainIdDec) return CHAINS.sepolia.blockExplorer;
    if (currentChainId === CHAINS.mainnet.chainIdDec) return CHAINS.mainnet.blockExplorer;
    // par défaut, utilise le réseau cible choisi dans l’UI
    return targetCfg.blockExplorer;
  }, [currentChainId, targetCfg]);

  async function ensureNetwork(chainKey) {
    if (!window.ethereum) {
      setStatus("MetaMask non détecté.");
      return false;
    }
    const cfg = CHAINS[chainKey];
    try {
      // tente un switch simple
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: cfg.chainIdHex }],
      });
      setStatus(`Réseau basculé sur ${cfg.name}.`);
      return true;
    } catch (err) {
      // si le réseau n’est pas ajouté, on l’ajoute
      if (err?.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: cfg.chainIdHex,
                chainName: cfg.name,
                nativeCurrency: cfg.currency,
                rpcUrls: cfg.rpcUrls,
                blockExplorerUrls: [cfg.blockExplorer],
              },
            ],
          });
          setStatus(`Réseau ${cfg.name} ajouté et sélectionné.`);
          return true;
        } catch (e2) {
          setStatus("Ajout de réseau refusé dans MetaMask.");
          return false;
        }
      } else {
        setStatus("Changement de réseau refusé dans MetaMask.");
        return false;
      }
    }
  }

  async function connectWallet() {
    try {
      if (!window.ethereum) {
        setStatus("MetaMask n'est pas détecté. Installe-le d'abord.");
        return;
      }
      // s’assure d’abord d’être sur le réseau choisi
      const ok = await ensureNetwork(target);
      if (!ok) return;

      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
      setStatus("Wallet connecté.");
    } catch (e) {
      setStatus("Erreur connexion: " + (e?.message || String(e)));
    }
  }

  function fillTestBytecode() {
    setBytecode(TEST_BYTECODE);
    setStatus("Bytecode de test inséré (contrat vide). Tu peux déployer.");
  }

  async function deployContract() {
    setStatus("");
    setTxHash("");
    setContractAddress("");

    try {
      if (!window.ethereum) {
        setStatus("MetaMask requis.");
        return;
      }
      if (!bytecode || bytecode.trim().length < 4) {
        setStatus("Colle un creation bytecode valide (0x...), ou clique 'Remplir un bytecode de test'.");
        return;
      }

// garantit qu’on est bien sur le réseau sélectionné (force Sepolia par défaut)
const ok = await ensureNetwork("sepolia");  // force le testnet Sepolia
if (!ok) return;

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const dataHex = bytecode.startsWith("0x") ? bytecode : "0x" + bytecode;
setStatus("Préparation de la transaction… vérifie MetaMask.");

// Ajout d’un gasLimit pour réduire les frais et aider Coinbase/MetaMask à signer
const tx = await signer.sendTransaction({
  data: dataHex,
  gasLimit: 70000, // environ 0.000001 ETH, quasi gratuit
});

setTxHash(tx.hash);
setStatus("Transaction envoyée. Attente de confirmation…");

      const receipt = await tx.wait();
      const addr = receipt?.contractAddress || "";
      setContractAddress(addr);
      setStatus(
        addr
          ? `Confirmé ✅ Contrat déployé à ${addr}`
          : "Confirmé, mais pas d'adresse de contrat (bytecode probablement non-créateur)."
      );
    } catch (e) {
      setStatus("Erreur: " + (e?.message || String(e)));
    }
  }

  function shorten(addr) {
    return addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "";
  }

  const box = { maxWidth: 820, margin: "40px auto", fontFamily: "Inter, system-ui, Arial" };
  const card = { background: "#111827", color: "white", padding: 20, borderRadius: 14 };
  const btn = { padding: "10px 14px", borderRadius: 10, border: 0, cursor: "pointer" };
  const pill = { padding: "6px 10px", background: "#0b1220", borderRadius: 999 };

  return (
    <div style={box}>
      <div style={card}>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>Farcaster Mini — Contract Creator</h1>
        <p style={{ opacity: 0.8, marginBottom: 16 }}>
          Connecte ton wallet et déploie un mini-contrat via son bytecode (démo).
        </p>

        {/* Sélecteur de réseau + info réseau courant */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Réseau cible :</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, background: "#1f2937", color: "white", border: "1px solid #374151" }}
          >
            <option value="sepolia">Sepolia (testnet)</option>
            <option value="mainnet">Ethereum Mainnet</option>
          </select>

          <button
            style={{ ...btn, background: "#0ea5e9", color: "white" }}
            onClick={() => ensureNetwork(target)}
          >
            Basculer sur {targetCfg.name}
          </button>

          <span style={{ ...pill, fontSize: 12 }}>
            Réseau actuel (wallet) :{" "}
            {currentChainId === CHAINS.sepolia.chainIdDec
              ? "Sepolia"
              : currentChainId === CHAINS.mainnet.chainIdDec
              ? "Mainnet"
              : currentChainId
              ? `ChainId ${currentChainId}`
              : "inconnu"}
          </span>
        </div>

        {/* Wallet */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Wallet :</div>
            <div style={{ fontSize: 14 }}>
              {account ? shorten(account) : <span style={{ opacity: 0.7 }}>Aucun wallet</span>}
            </div>
          </div>

          {account ? (
            <button
              style={{ ...btn, background: "#ef4444", color: "white" }}
              onClick={() => {
                setAccount(null);
                setStatus("Déconnecté.");
              }}
            >
              Déconnecter
            </button>
          ) : (
            <button style={{ ...btn, background: "#10b981", color: "white" }} onClick={connectWallet}>
              Connecter le wallet
            </button>
          )}
        </div>

        {/* Bytecode */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, opacity: 0.8, display: "block", marginBottom: 6 }}>
            Bytecode de création du contrat
          </label>
        </div>

        <textarea
          rows={6}
          value={bytecode}
          onChange={(e) => setBytecode(e.target.value)}
          placeholder="Colle ici le creation bytecode (0x...) ou clique sur 'Remplir un bytecode de test'"
          style={{
            width: "100%",
            background: "#1f2937",
            color: "white",
            border: "1px solid #374151",
            borderRadius: 8,
            padding: 10,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas",
            fontSize: 12,
            marginBottom: 10,
          }}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...btn, background: "#6366f1", color: "white" }} onClick={fillTestBytecode}>
            Remplir un bytecode de test
          </button>

          <button style={{ ...btn, background: "#7c3aed", color: "white" }} onClick={deployContract}>
            Déployer le contrat (inutile)
          </button>

          <button
            style={{ ...btn, background: "#374151", color: "white" }}
            onClick={() => {
              setBytecode("");
              setStatus("");
              setTxHash("");
              setContractAddress("");
            }}
          >
            Réinitialiser
          </button>
        </div>

        {/* Statut + liens Etherscan dynamiques */}
        <div style={{ marginTop: 12, padding: 10, background: "#0b1220", borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Statut :</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{status || "—"}</pre>

          {txHash && (
            <div style={{ marginTop: 6 }}>
              TX :{" "}
              <a
                href={`${explorerBase}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#93c5fd" }}
              >
                {txHash}
              </a>
            </div>
          )}

          {contractAddress && (
            <div style={{ marginTop: 4 }}>
              Address :{" "}
              <a
                href={`${explorerBase}/address/${contractAddress}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#93c5fd" }}
              >
                {contractAddress}
              </a>
            </div>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          Astuce : utilise <strong>Sepolia</strong> pour tester (quasi gratuit). Le bouton “Basculer sur Sepolia”
          ajoute le réseau à MetaMask si besoin.
        </div>
      </div>
    </div>
  );
}
