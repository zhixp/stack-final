/* global BigInt */
import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createPublicClient, createWalletClient, custom, http, parseEther, formatEther } from 'viem';
import Game from './Game.jsx';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './abi.js';

// --- CONFIGURATION ---
const BACKEND_API_URL = "http://localhost:3000/api/submit-score"; 

const abstractChain = {
  id: 11124,
  name: 'Abstract Testnet',
  network: 'abstract-testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://api.testnet.abs.xyz'] } },
};

function App() {
  // --- HOOKS ---
  const { login, authenticated, user, logout } = usePrivy();
  const { wallets } = useWallets();
  
  // --- STATE ---
  const [potSize, setPotSize] = useState("0");
  const [highScore, setHighScore] = useState("0");
  const [king, setKing] = useState("0x00...00");
  const [credits, setCredits] = useState(0);
  const [targetScore, setTargetScore] = useState(0);
  
  const [buyAmount, setBuyAmount] = useState(5);
  const [isGameActive, setIsGameActive] = useState(false);
  const [isWriting, setIsWriting] = useState(false);

  // --- LOGIC ---
  const fetchGameState = async () => {
    try {
      const publicClient = createPublicClient({ chain: abstractChain, transport: http() });
      const playerAddress = user?.wallet?.address || "0x0000000000000000000000000000000000000000";
      
      const [pot, hs, k, target, creds] = await Promise.all([
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'pot' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'currentHighScore' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'currentKing' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'targetScore' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'credits', args: [playerAddress] })
      ]);

      setPotSize(formatEther(pot));
      setHighScore(hs.toString());
      setKing(k);
      setTargetScore(Number(target));
      setCredits(Number(creds));
    } catch (error) { console.error("Read Error:", error); }
  };

  useEffect(() => {
    fetchGameState();
    const interval = setInterval(fetchGameState, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const getSigner = async () => {
    const wallet = wallets[0];
    if (!wallet) throw new Error("No wallet connected");
    await wallet.switchChain(11124);
    const provider = await wallet.getEthereumProvider();
    return createWalletClient({ account: wallet.address, chain: abstractChain, transport: custom(provider) });
  };

  const handleBuyCredits = async () => {
    try {
      setIsWriting(true);
      const client = await getSigner();
      const [address] = await client.getAddresses();
      const costString = (buyAmount * 0.00001).toFixed(5).toString();

      await client.writeContract({
        address: CONTRACT_ADDRESS, 
        abi: CONTRACT_ABI, 
        functionName: 'buyCredits',
        account: address, 
        value: parseEther(costString),
      });
      
      alert(`Success! Purchased ${buyAmount} Credits.`);
      setIsWriting(false);
      fetchGameState(); 
    } catch (error) {
      console.error(error);
      setIsWriting(false);
      alert("Purchase Failed: " + (error.shortMessage || error.message));
    }
  };

  const handleClaimPot = async () => {
    try {
      setIsWriting(true);
      const client = await getSigner();
      const [address] = await client.getAddresses();
      
      await client.writeContract({
        address: CONTRACT_ADDRESS, 
        abi: CONTRACT_ABI, 
        functionName: 'claimPot',
        account: address
      });
      
      alert("POT CLAIMED! CONGRATULATIONS!");
      setIsWriting(false);
      fetchGameState();
    } catch (error) {
      setIsWriting(false);
      alert("Claim Failed: " + (error.shortMessage || error.message));
    }
  };

  const handleStartGame = () => {
    if (credits > 0) {
        setIsGameActive(true); 
    } else {
        alert("No Credits! Buy some to enter.");
    }
  };

  const handleGameOver = async (score, biometrics) => {
    setIsGameActive(false);
    if (score === 0 || !biometrics) return;
    setCredits(prev => Math.max(0, prev - 1));

    try {
        setIsWriting(true);
        const wallet = wallets[0];
        const response = await fetch(BACKEND_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userAddress: wallet.address,
                gameData: { score, duration: biometrics.duration, clickOffsets: biometrics.clickOffsets }
            })
        });

        const data = await response.json();
        if (!data.success) throw new Error("Security Check Failed: " + data.message);

        const client = await getSigner();
        await client.writeContract({
            address: CONTRACT_ADDRESS, 
            abi: CONTRACT_ABI, 
            functionName: 'submitScore',
            account: wallet.address, 
            args: [BigInt(score), data.signature]
        });

        alert("Score Verified & Submitted to Chain!");
        fetchGameState();
    } catch (error) {
        console.error("Submission Error", error);
        alert("Error submitting score: " + error.message);
    } finally {
        setIsWriting(false);
    }
  };

  // --- RENDER WITH SEMANTIC UI LABELS ---
  return (
    <div className="app-container ui-app-container">
      
      {/* TOP BAR */}
      <div className="top-bar ui-top-bar">
        <div className="logo ui-logo">
            STACK <span className="highlight ui-logo-highlight">ULTIMATE</span>
        </div>
        
        <div className="ticker ui-ticker">
           <span className="ui-ticker-item ui-ticker-credits">🎟 {credits}</span>
           <span className="ui-ticker-divider">&nbsp;|&nbsp;</span> 
           <span className="ui-ticker-item ui-ticker-target">🎯 TARGET: {targetScore}</span>
           <span className="ui-ticker-divider">&nbsp;|&nbsp;</span>
           <span className="ui-ticker-item ui-ticker-pot">💰 {potSize} ETH</span>
        </div>

        {authenticated ? (
          <button onClick={logout} className="connect-btn ui-btn-logout">
            {user?.wallet?.address.substring(0,6)}... (LOGOUT)
          </button>
        ) : (
          <button onClick={login} className="connect-btn ui-btn-login">
            LOGIN
          </button>
        )}
      </div>

      {/* MAIN ARENA */}
      <div className="arena ui-arena">
        {!authenticated ? (
          // STATE: LOGGED OUT
          <div className="welcome-card ui-card-welcome">
            <h1 className="ui-welcome-title">PROOF OF SKILL</h1>
            <p className="ui-welcome-subtitle">Login to Play</p>
            <button onClick={login} className="play-btn ui-btn-hero-login">LOGIN</button>
          </div>
        ) : (
          <>
            {/* STATE: LOBBY */}
            {!isGameActive ? (
              <div className="lobby-card ui-card-lobby">
                
                <div className="stats-row ui-stats-row">
                  <div className="stat-box ui-stat-box ui-stat-pot">
                    <div className="label ui-label">POT</div>
                    <div className="value glow-green ui-value ui-value-pot">{potSize} ETH</div>
                  </div>
                  <div className="stat-box ui-stat-box ui-stat-highscore">
                    <div className="label ui-label">HIGH SCORE</div>
                    <div className="value ui-value ui-value-highscore">{highScore}</div>
                  </div>
                </div>

                {/* KING STATUS SECTION */}
                {king.toLowerCase() === user?.wallet?.address.toLowerCase() && Number(highScore) > targetScore ? (
                    <div className="king-status ui-section-king-active" style={{marginBottom: '15px', padding: '10px', border: '1px solid gold', borderRadius: '8px'}}>
                        <h3 className="ui-text-king-title" style={{color: 'gold', margin: '5px 0'}}>👑 YOU ARE THE KING! 👑</h3>
                        <p className="ui-text-king-subtitle" style={{fontSize: '12px', color: '#aaa'}}>Wait for 48h or challenge to end</p>
                        <button className="buy-btn ui-btn-claim" style={{background: 'gold', color: 'black', marginTop: '10px'}} onClick={handleClaimPot} disabled={isWriting}>
                            {isWriting ? "CLAIMING..." : "CLAIM POT NOW"}
                        </button>
                    </div>
                ) : (
                    <div className="king-display ui-section-king-passive">
                        Current King: <span className="ui-text-king-address">{king.substring(0,8)}...</span>
                    </div>
                )}

                <div className="divider ui-divider"></div>

                {/* PLAY BUTTON AREA */}
                {credits > 0 ? (
                    <div className="action-area ui-action-area">
                        <button className="play-btn ui-btn-play" onClick={handleStartGame}>
                          PLAY NOW ({credits})
                        </button>
                    </div>
                ) : null}

                {/* TICKET SHOP AREA */}
                <div className="ticket-shop ui-section-shop">
                    <div className="ticket-controls ui-shop-controls">
                        <button className="control-btn ui-btn-shop-minus" onClick={() => setBuyAmount(Math.max(1, buyAmount - 1))}>-</button>
                        <input 
                            type="number" 
                            className="ticket-input ui-input-shop-amount" 
                            value={buyAmount} 
                            onChange={(e) => setBuyAmount(Number(e.target.value))} 
                            min="1" max="50"
                        />
                        <button className="control-btn ui-btn-shop-plus" onClick={() => setBuyAmount(Math.min(50, buyAmount + 1))}>+</button>
                    </div>
                    
                    <button className="buy-btn ui-btn-buy" onClick={handleBuyCredits} disabled={isWriting}>
                       {isWriting ? "CONFIRMING..." : `BUY CREDITS ${(buyAmount * 0.00001).toFixed(5)} ETH`}
                    </button>
                </div>
              </div>
            ) : (
              // STATE: PLAYING GAME
              <Game gameActive={isGameActive} onGameOver={handleGameOver} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;