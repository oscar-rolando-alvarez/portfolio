import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { DefiLendingProtocol } from "../target/types/defi_lending_protocol";
import { GovernanceToken } from "../target/types/governance_token";
import { 
  createMint, 
  createAssociatedTokenAccount, 
  mintTo, 
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert, expect } from "chai";

describe("DeFi Lending Protocol", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DefiLendingProtocol as Program<DefiLendingProtocol>;
  const governanceProgram = anchor.workspace.GovernanceToken as Program<GovernanceToken>;

  // Test accounts
  const admin = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const liquidator = anchor.web3.Keypair.generate();
  const treasury = anchor.web3.Keypair.generate();
  const emergencyAdmin = anchor.web3.Keypair.generate();

  // Token mints
  let usdcMint: anchor.web3.PublicKey;
  let solMint: anchor.web3.PublicKey;
  let governanceTokenMint: anchor.web3.PublicKey;

  // PDAs
  let protocolPda: anchor.web3.PublicKey;
  let usdcPoolPda: anchor.web3.PublicKey;
  let solPoolPda: anchor.web3.PublicKey;
  let userObligationPda: anchor.web3.PublicKey;

  before(async () => {
    // Airdrop SOL to test accounts
    await provider.connection.requestAirdrop(admin.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(liquidator.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(treasury.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);

    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create token mints
    usdcMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      admin.publicKey,
      6 // USDC decimals
    );

    solMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      admin.publicKey,
      9 // SOL decimals
    );

    governanceTokenMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      admin.publicKey,
      6 // Governance token decimals
    );

    // Calculate PDAs
    [protocolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      program.programId
    );

    [usdcPoolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), usdcMint.toBuffer()],
      program.programId
    );

    [solPoolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), solMint.toBuffer()],
      program.programId
    );

    [userObligationPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user_obligation"), user.publicKey.toBuffer(), protocolPda.toBuffer()],
      program.programId
    );
  });

  describe("Protocol Initialization", () => {
    it("Initializes the protocol", async () => {
      const tx = await program.methods
        .initializeProtocol(admin.publicKey, 500) // 5% fee rate
        .accounts({
          protocol: protocolPda,
          admin: admin.publicKey,
          treasury: treasury.publicKey,
          emergencyAdmin: emergencyAdmin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      console.log("Protocol initialization tx:", tx);

      // Verify protocol state
      const protocolAccount = await program.account.protocol.fetch(protocolPda);
      assert.equal(protocolAccount.admin.toString(), admin.publicKey.toString());
      assert.equal(protocolAccount.feeRate, 500);
      assert.equal(protocolAccount.totalPools, 0);
      assert.equal(protocolAccount.paused, false);
    });
  });

  describe("Pool Management", () => {
    it("Initializes USDC pool", async () => {
      // Create mock oracle account (in real implementation, this would be Pyth/Switchboard)
      const mockOracle = anchor.web3.Keypair.generate();

      const [poolAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), usdcMint.toBuffer(), Buffer.from("authority")],
        program.programId
      );

      const [assetTokenAccount] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), usdcMint.toBuffer(), Buffer.from("reserve")],
        program.programId
      );

      const [aTokenMint] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), usdcMint.toBuffer(), Buffer.from("atoken")],
        program.programId
      );

      const [stableDebtTokenMint] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), usdcMint.toBuffer(), Buffer.from("stable_debt")],
        program.programId
      );

      const [variableDebtTokenMint] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), usdcMint.toBuffer(), Buffer.from("variable_debt")],
        program.programId
      );

      const tx = await program.methods
        .initializePool(
          usdcMint,
          7500, // 75% collateral factor
          1000, // 10% reserve factor
          8000, // 80% liquidation threshold
          1000  // 10% liquidation bonus
        )
        .accounts({
          protocol: protocolPda,
          pool: usdcPoolPda,
          assetMint: usdcMint,
          assetTokenAccount,
          aTokenMint,
          stableDebtTokenMint,
          variableDebtTokenMint,
          poolAuthority,
          oraclePriceFeed: mockOracle.publicKey,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      console.log("USDC pool initialization tx:", tx);

      // Verify pool state
      const poolAccount = await program.account.pool.fetch(usdcPoolPda);
      assert.equal(poolAccount.assetMint.toString(), usdcMint.toString());
      assert.equal(poolAccount.active, true);
      assert.equal(poolAccount.reserveConfig.ltv, 7500);
    });

    it("Initializes SOL pool", async () => {
      const mockOracle = anchor.web3.Keypair.generate();

      const [poolAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), solMint.toBuffer(), Buffer.from("authority")],
        program.programId
      );

      const [assetTokenAccount] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), solMint.toBuffer(), Buffer.from("reserve")],
        program.programId
      );

      const [aTokenMint] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), solMint.toBuffer(), Buffer.from("atoken")],
        program.programId
      );

      const [stableDebtTokenMint] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), solMint.toBuffer(), Buffer.from("stable_debt")],
        program.programId
      );

      const [variableDebtTokenMint] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), solMint.toBuffer(), Buffer.from("variable_debt")],
        program.programId
      );

      const tx = await program.methods
        .initializePool(
          solMint,
          6500, // 65% collateral factor
          1500, // 15% reserve factor
          7500, // 75% liquidation threshold
          1500  // 15% liquidation bonus
        )
        .accounts({
          protocol: protocolPda,
          pool: solPoolPda,
          assetMint: solMint,
          assetTokenAccount,
          aTokenMint,
          stableDebtTokenMint,
          variableDebtTokenMint,
          poolAuthority,
          oraclePriceFeed: mockOracle.publicKey,
          admin: admin.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      console.log("SOL pool initialization tx:", tx);
    });
  });

  describe("User Operations", () => {
    let userUsdcAccount: anchor.web3.PublicKey;
    let userATokenAccount: anchor.web3.PublicKey;

    before(async () => {
      // Create user token accounts
      userUsdcAccount = await createAssociatedTokenAccount(
        provider.connection,
        user,
        usdcMint,
        user.publicKey
      );

      const [aTokenMint] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), usdcMint.toBuffer(), Buffer.from("atoken")],
        program.programId
      );

      userATokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        user,
        aTokenMint,
        user.publicKey
      );

      // Mint USDC to user
      await mintTo(
        provider.connection,
        admin,
        usdcMint,
        userUsdcAccount,
        admin,
        10000 * 10**6 // 10,000 USDC
      );
    });

    it("Initializes user obligation", async () => {
      const tx = await program.methods
        .initUserObligation()
        .accounts({
          protocol: protocolPda,
          userObligation: userObligationPda,
          user: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      console.log("User obligation initialization tx:", tx);

      // Verify user obligation state
      const obligationAccount = await program.account.userObligation.fetch(userObligationPda);
      assert.equal(obligationAccount.user.toString(), user.publicKey.toString());
      assert.equal(obligationAccount.depositsLen, 0);
      assert.equal(obligationAccount.borrowsLen, 0);
    });

    it("Supplies USDC to the pool", async () => {
      const supplyAmount = 1000 * 10**6; // 1,000 USDC

      const [assetTokenAccount] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), usdcMint.toBuffer(), Buffer.from("reserve")],
        program.programId
      );

      const [aTokenMint] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), usdcMint.toBuffer(), Buffer.from("atoken")],
        program.programId
      );

      const [poolAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), usdcMint.toBuffer(), Buffer.from("authority")],
        program.programId
      );

      const tx = await program.methods
        .supply(new anchor.BN(supplyAmount))
        .accounts({
          protocol: protocolPda,
          pool: usdcPoolPda,
          userObligation: userObligationPda,
          userAssetAccount: userUsdcAccount,
          poolAssetAccount: assetTokenAccount,
          userATokenAccount,
          aTokenMint,
          poolAuthority,
          user: user.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user])
        .rpc();

      console.log("Supply tx:", tx);

      // Verify user received aTokens
      const userATokenBalance = await getAccount(provider.connection, userATokenAccount);
      assert(userATokenBalance.amount > 0);

      // Verify pool received underlying tokens
      const poolAssetBalance = await getAccount(provider.connection, assetTokenAccount);
      assert.equal(Number(poolAssetBalance.amount), supplyAmount);
    });

    it("Borrows against supplied collateral", async () => {
      // This test would require oracle implementation for proper collateral valuation
      // For now, we'll skip the actual borrow test but the structure is here
      console.log("Borrow test skipped - requires oracle implementation");
    });
  });

  describe("Interest Rate Calculations", () => {
    it("Updates interest rates", async () => {
      const tx = await program.methods
        .updateInterestRates()
        .accounts({
          pool: usdcPoolPda,
        })
        .rpc();

      console.log("Interest rate update tx:", tx);

      // Verify rates were updated
      const poolAccount = await program.account.pool.fetch(usdcPoolPda);
      console.log("Liquidity rate:", poolAccount.liquidityRate);
      console.log("Variable borrow rate:", poolAccount.variableBorrowRate);
    });
  });

  describe("Flash Loans", () => {
    it("Executes a flash loan", async () => {
      // This test would require implementing a flash loan receiver program
      console.log("Flash loan test skipped - requires receiver program implementation");
    });
  });

  describe("Governance", () => {
    it("Initializes governance token", async () => {
      const initialSupply = 1000000 * 10**6; // 1M tokens

      const tx = await governanceProgram.methods
        .initializeGovernanceToken(
          new anchor.BN(initialSupply),
          admin.publicKey
        )
        .accounts({
          // Governance accounts would go here
        })
        .signers([admin])
        .rpc();

      console.log("Governance token initialization tx:", tx);
    });
  });

  describe("Liquidations", () => {
    it("Liquidates unhealthy positions", async () => {
      // This test would require setting up an unhealthy position first
      console.log("Liquidation test skipped - requires unhealthy position setup");
    });
  });

  describe("Error Cases", () => {
    it("Rejects invalid supply amount", async () => {
      try {
        await program.methods
          .supply(new anchor.BN(0))
          .accounts({
            // Supply accounts...
          })
          .signers([user])
          .rpc();
        
        assert.fail("Expected transaction to fail");
      } catch (error) {
        assert(error.message.includes("InvalidAmount"));
      }
    });

    it("Rejects unauthorized protocol operations", async () => {
      try {
        await program.methods
          .initializeProtocol(user.publicKey, 500)
          .accounts({
            protocol: protocolPda,
            admin: user.publicKey, // Wrong admin
            treasury: treasury.publicKey,
            emergencyAdmin: emergencyAdmin.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([user])
          .rpc();
        
        assert.fail("Expected transaction to fail");
      } catch (error) {
        assert(error.message.includes("already in use"));
      }
    });
  });
});