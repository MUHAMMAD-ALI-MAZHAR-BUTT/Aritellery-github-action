import sinon from 'sinon';
import MultiSigWallet from '../model/multiSigWallet';
import { networks } from 'bitcoinjs-lib';
import { expect } from 'chai';
import { Database } from '../database.types';
import { SupabaseClient } from '@supabase/supabase-js';
import Supabase from '../model/supabase';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import Esplora from '../api/esplora';
import { BidDetailType, OrderDetailType } from '../model/data/types';
const ECPair = ECPairFactory(ecc);


describe('MultiSigWallet', () => {
    // Using a known test seed for deterministic results
    const seed = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
    let multiSigWallet: MultiSigWallet;
    let supabase: Supabase;
    let esplora: Esplora;

    beforeEach(() => {
        supabase = new Supabase({ supabase: {} as SupabaseClient<Database>, platformFeeAddress: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' });
        esplora = new Esplora('https://mock.info/testnet/api');

        multiSigWallet = new MultiSigWallet({
            supabase,
            seed,
            network: networks.testnet,
            esplora,
        });

        sinon.restore();
    });

    describe('createMultisig', () => {
        // Known valid compressed public key for testing
        const validPubKey = '02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9';
        
        it('should create a valid multisig address', () => {
            const result = multiSigWallet.createMultisig(0, validPubKey, 0);
            expect(result.address).to.be.a('string');
            expect(result.address).to.match(/^tb1/); // testnet native segwit address
            expect(result.witnessScript).to.be.instanceOf(Buffer);
            expect(result.serverKeyDerivationPath).to.equal("m/84'/1'/0'/0/0"); // testnet path
            expect(result.serverPublicKey).to.be.a('string');
            expect(result.serverPublicKey).to.match(/^[0-9a-f]{66}$/i); // 33 bytes hex
        });

        it('should throw error for invalid public key', () => {
            const invalidPubKey = 'invalid-public-key';
            expect(() => {
                multiSigWallet.createMultisig(0, invalidPubKey, 0);
            }).to.throw('Invalid user public key');
        });

        it('should create different addresses for different indexes', () => {
            const result1 = multiSigWallet.createMultisig(0, validPubKey, 0);
            const result2 = multiSigWallet.createMultisig(0, validPubKey, 1);
            expect(result1.address).to.not.equal(result2.address);
            expect(result1.serverKeyDerivationPath).to.equal("m/84'/1'/0'/0/0");
            expect(result2.serverKeyDerivationPath).to.equal("m/84'/1'/0'/0/1");
        });

        it('should create different addresses for different accounts', () => {
            const result1 = multiSigWallet.createMultisig(0, validPubKey, 0);
            const result2 = multiSigWallet.createMultisig(1, validPubKey, 0);
            expect(result1.address).to.not.equal(result2.address);
            expect(result1.serverKeyDerivationPath).to.equal("m/84'/1'/0'/0/0");
            expect(result2.serverKeyDerivationPath).to.equal("m/84'/1'/1'/0/0");
        });

        it('should create consistent addresses for the same inputs', () => {
            const result1 = multiSigWallet.createMultisig(0, validPubKey, 0);
            const result2 = multiSigWallet.createMultisig(0, validPubKey, 0);
            expect(result1.address).to.equal(result2.address);
            expect(result1.witnessScript.toString('hex')).to.equal(result2.witnessScript.toString('hex'));
            expect(result1.serverPublicKey).to.equal(result2.serverPublicKey);
            expect(result1.serverKeyDerivationPath).to.equal(result2.serverKeyDerivationPath);
        });

        it('should properly sort public keys in witness script', () => {
            const result = multiSigWallet.createMultisig(0, validPubKey, 0);
            const witnessScriptHex = result.witnessScript.toString('hex');
            
            // Check that the witness script contains both public keys
            expect(witnessScriptHex).to.include(result.serverPublicKey.slice(2)); // Remove '02' prefix
            expect(witnessScriptHex).to.include(validPubKey.slice(2)); // Remove '02' prefix
            
            // Verify it's a 2-of-2 multisig script
            expect(witnessScriptHex).to.match(/^5221.*21.*52ae$/); // OP_2 <pubkey1> <pubkey2> OP_2 OP_CHECKMULTISIG
        });

        it('should handle mainnet addresses correctly', () => {
            const mainnetWallet = new MultiSigWallet({ seed, supabase, network: networks.bitcoin, esplora });
            const result = mainnetWallet.createMultisig(0, validPubKey, 0);
            expect(result.address).to.match(/^bc1/); // mainnet native segwit address
            expect(result.serverKeyDerivationPath).to.equal("m/84'/0'/0'/0/0"); // mainnet path
        });
    });

    describe('Account Index Validation', () => {
        const validPubKey = '02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9';
    
        it('should accept valid account indices', () => {
            expect(() => multiSigWallet.createMultisig(0, validPubKey)).not.to.throw();
            expect(() => multiSigWallet.createMultisig(2147483647, validPubKey)).not.to.throw();
            expect(() => multiSigWallet.createMultisig(1000000, validPubKey)).not.to.throw();
        });
    
        it('should reject invalid account indices', () => {
            expect(() => multiSigWallet.createMultisig(-1, validPubKey))
                .to.throw('Account index must be between 0 and 2147483647');
            expect(() => multiSigWallet.createMultisig(2147483648, validPubKey))
                .to.throw('Account index must be between 0 and 2147483647');
            expect(() => multiSigWallet.createMultisig(2.5, validPubKey))
                .to.throw('Account index must be between 0 and 2147483647');
        });
    });


    describe('getOrCreateWallet', () => { 
        const userPublicKey = '037e94c8d3b5e285443bb3aa0136cce155c8de8e187ce4ad7ec425f74f3ac0688a';
        const userAddress = '36XKARPT1zAkzX1zDN4jpesoPzez7TeR4Z';

        let setMultiSigWalletSpy: sinon.SinonStub;
        let getMultiSigWalletSpy: sinon.SinonStub;
        let reserveMultiSigWalletSpy: sinon.SinonStub;

        beforeEach(() => {
            setMultiSigWalletSpy = sinon.stub(supabase, 'setMultiSigWallet').resolves();
            reserveMultiSigWalletSpy = sinon.stub(supabase, 'reserveMultiSigWallet').resolves(0);
        });

        it('should create a new wallet if none exists', async () => {
            getMultiSigWalletSpy = sinon.stub(supabase, 'getMultiSigWallet').resolves([]);

            const wallet = await multiSigWallet.getOrCreateWallet(userPublicKey, userAddress);
            if ('error' in wallet) {
                throw new Error(wallet.error);
            }

            expect(reserveMultiSigWalletSpy.calledOnce).to.be.true;
            expect(reserveMultiSigWalletSpy.calledWith(userPublicKey, userAddress)).to.be.true;
            expect(setMultiSigWalletSpy.calledOnce).to.be.true;
            expect(setMultiSigWalletSpy.getCall(0).args).to.deep.equal([0, 0, 'm/84\'/1\'/0\'/0/0', wallet.multiSigAddress]);
            expect(wallet.multiSigAddress).to.be.a('string');
            expect(wallet.multiSigAddress).to.match(/^tb1/); // testnet native segwit address
            expect(wallet.witnessScript).to.be.a('string');
            expect(wallet.serverPublicKey).to.be.a('string');
            expect(wallet).to.deep.equal(
                {
                    multiSigAddress: "tb1qnvwu7qsafq4dtjv6gpjdhmf6g84g77v36mlqakqznzkpcm7jg3yq5avunm",
                    witnessScript: "5221020c7f4de1cc760fc068775b1513d67d0a7802f0b4b1c61aa85784ebf722905b2721037e94c8d3b5e285443bb3aa0136cce155c8de8e187ce4ad7ec425f74f3ac0688a52ae",
                    serverPublicKey: "020c7f4de1cc760fc068775b1513d67d0a7802f0b4b1c61aa85784ebf722905b27",
                }
            );
        });

        it('should return existing wallet if one exists', async () => {
            getMultiSigWalletSpy = sinon.stub(supabase, 'getMultiSigWallet').resolves([
                {
                    account_index: 0,
                    address_index: 0,
                    user_public_key_hex: userPublicKey,
                }
            ]);

            const wallet = await multiSigWallet.getOrCreateWallet(userPublicKey, userAddress);
            if ('error' in wallet) {
                throw new Error(wallet.error);
            }

            expect(reserveMultiSigWalletSpy.called).to.be.false;
            expect(setMultiSigWalletSpy.called).to.be.false;
            expect(wallet.multiSigAddress).to.be.a('string');
            expect(wallet).to.deep.equal({
                multiSigAddress: "tb1qnvwu7qsafq4dtjv6gpjdhmf6g84g77v36mlqakqznzkpcm7jg3yq5avunm",
                witnessScript: "5221020c7f4de1cc760fc068775b1513d67d0a7802f0b4b1c61aa85784ebf722905b2721037e94c8d3b5e285443bb3aa0136cce155c8de8e187ce4ad7ec425f74f3ac0688a52ae",
                serverPublicKey: "020c7f4de1cc760fc068775b1513d67d0a7802f0b4b1c61aa85784ebf722905b27",
            });
        });
     });

     describe('createUnsignedWithdrawalTransaction', () => {
        const userPublicKey = '037e94c8d3b5e285443bb3aa0136cce155c8de8e187ce4ad7ec425f74f3ac0688a';
        const recipientAddress = '2MvHSREkDwDfLg1K4aQiSm5kyoYL9SfGp1V';
        
        // Test UTXOs
        const testUtxos = [
            {
                txid: '7cb3d680e1fef1f0db8e0d47966ad936a64c7c54fa32a1db00b4c7a0de10ed5c',
                vout: 0,
                value: 100000, // 0.001 BTC
                status: {
                    confirmed: true,
                    block_height: 883328,
                    block_hash: "000000000000000000003ac0a58830f247c3773a2958bdb3d924ba7ab94b99ec",
                    block_time: 1739294985
                }
            }
        ];
        
        // Test database responses
        const testWalletData = [
            {
                account_index: 0,
                address_index: 0,
                user_public_key_hex: userPublicKey,
                wallet_address: 'tb1qnvwu7qsafq4dtjv6gpjdhmf6g84g77v36mlqakqznzkpcm7jg3yq5avunm',
                reserved_balance:0,
            }
        ];
        
        let getMultiSigWalletStub: sinon.SinonStub;
        let getWalletUtxosSpy: sinon.SinonStub;
        
        beforeEach(() => {
            getMultiSigWalletStub = sinon.stub(supabase, 'getMultiSigWallet').resolves(testWalletData);
            getWalletUtxosSpy = sinon.stub(multiSigWallet, 'getWalletUtxos').resolves({
                reservedUtxos: [],
                reservedBalance: 0,
                availableBalance: 100000,
                availableUtxos: testUtxos,
            });
        });
        
        it('should create a valid unsigned PSBT', async () => {
            const result = await multiSigWallet.createUnsignedWithdrawalTransaction({
                userPublicKey,
                recipientAddress,
                amountSats: 50000, // 0.0005 BTC
                feeSatsPerByte: 5
            });
            
            expect(getMultiSigWalletStub.calledOnce).to.be.true;
            expect(getMultiSigWalletStub.calledWith(userPublicKey)).to.be.true;
            
            expect(result).to.have.property('psbtBase64');
            expect(result.psbtBase64).to.be.a('string');
            expect(result).to.have.property('pasbtHex');
            expect(result.pasbtHex).to.be.a('string');
            expect(result.ordinalInputIndices).to.deep.equal([]);
            expect(result.paymentInputIndices).to.deep.equal([0]);


            if (result.psbtBase64 === undefined) {
                throw new Error('Expected PSBT to be returned');
            }
            
            // Validate the PSBT structure
            const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: networks.testnet });
            
            // Check inputs
            expect(psbt.data.inputs.length).to.equal(1);
            expect(psbt.data.inputs[0].witnessUtxo).to.exist;
            expect(psbt.data.inputs[0].witnessUtxo!.value).to.equal(100000);
            
            // Check outputs
            expect(psbt.txOutputs.length).to.equal(2); // Payment + change
            expect(psbt.txOutputs[0].address).to.equal(recipientAddress);
            expect(psbt.txOutputs[0].value).to.equal(50000);
            
            // Verify change output
            const changeOutput = psbt.txOutputs[1];
            expect(changeOutput.value).to.be.greaterThan(0);
            expect(changeOutput.value).to.be.eqls(48740);
        });

        it('should create a valid unsigned sweep PSBT', async () => {
            const result = await multiSigWallet.createUnsignedWithdrawalTransaction({
                userPublicKey,
                recipientAddress,
                amountSats: 100000, // Sweep all funds
                feeSatsPerByte: 5
            });
            
            expect(getMultiSigWalletStub.calledOnce).to.be.true;
            expect(getMultiSigWalletStub.calledWith(userPublicKey)).to.be.true;
            
            expect(result).to.have.property('psbtBase64');
            expect(result.psbtBase64).to.be.a('string');
            expect(result).to.have.property('pasbtHex');
            expect(result.pasbtHex).to.be.a('string');
            expect(result.ordinalInputIndices).to.deep.equal([]);
            expect(result.paymentInputIndices).to.deep.equal([0]);


            if (result.psbtBase64 === undefined) {
                throw new Error('Expected PSBT to be returned');
            }
            
            // Validate the PSBT structure
            const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: networks.testnet });
            
            // Check inputs
            expect(psbt.data.inputs.length).to.equal(1);
            expect(psbt.data.inputs[0].witnessUtxo).to.exist;
            expect(psbt.data.inputs[0].witnessUtxo!.value).to.equal(100000);
            
            // Check outputs
            expect(psbt.txOutputs.length).to.equal(1); // Payment only
            expect(psbt.txOutputs[0].address).to.equal(recipientAddress);
            expect(psbt.txOutputs[0].value).to.equal(99170); // 100000 - (fee)
        });
        
        it('should return error when wallet not found', async () => {
            getMultiSigWalletStub.resolves([]);
            
            const result = await multiSigWallet.createUnsignedWithdrawalTransaction({
                userPublicKey,
                recipientAddress,
                amountSats: 50000,
                feeSatsPerByte: 5
            });
            
            expect(result).to.have.property('error');
            expect(result.error).to.equal('No wallet found');
        });
        
        it('should return error when insufficient funds', async () => {
            const result = await multiSigWallet.createUnsignedWithdrawalTransaction({
                userPublicKey,
                recipientAddress,
                amountSats: 99500, // Almost all funds, not enough for fee
                feeSatsPerByte: 5
            });
            
            expect(result).to.have.property('error');
            expect(result.error).to.include('Insufficient funds');
        });
        
        it('should not add change output when change is below dust limit', async () => {
            const result = await multiSigWallet.createUnsignedWithdrawalTransaction({
                userPublicKey,
                recipientAddress,
                amountSats: 99500, // Almost all funds, tiny change
                feeSatsPerByte: 1
            });
            
            expect(result).to.have.property('psbtBase64');

            if (result.psbtBase64 === undefined) {
                throw new Error('Expected PSBT to be returned');
            }
            
            const psbt = bitcoin.Psbt.fromBase64(result.psbtBase64, { network: networks.testnet });
            expect(psbt.txOutputs.length).to.equal(1); // Only payment, no change
        });
    });
    
    describe('signAndFinalizeWithdrawalTransaction', () => {
        // Create user key pair for testing
        const userKeyPair = ECPair.makeRandom({ network: networks.testnet });
        const userPublicKey = Buffer.from(userKeyPair.publicKey).toString('hex');
        const recipientAddress = '2MvHSREkDwDfLg1K4aQiSm5kyoYL9SfGp1V';
        
        // Test UTXOs
        const testUtxos = [
            {
                txid: '7cb3d680e1fef1f0db8e0d47966ad936a64c7c54fa32a1db00b4c7a0de10ed5c',
                vout: 0,
                value: 100000, // 0.001 BTC
                status: {
                    confirmed: true,
                    block_height: 883328,
                    block_hash: "000000000000000000003ac0a58830f247c3773a2958bdb3d924ba7ab94b99ec",
                    block_time: 1739294985
                }
            }
        ];
        
        // Test database responses
        const testWalletData = [
            {
                account_index: 0,
                address_index: 0,
                user_public_key_hex: userPublicKey,
                reserved_balance:0,
            }
        ];
        
        let getMultiSigWalletStub: sinon.SinonStub;
        let getWalletUtxosSpy: sinon.SinonStub;
        let psbtBase64: string;
        let broadcastTransactionSpy: sinon.SinonStub;
        
        // Create and partially sign a PSBT for testing
        beforeEach(async () => {
            getMultiSigWalletStub = sinon.stub(supabase, 'getMultiSigWallet').resolves(testWalletData);

            getWalletUtxosSpy = sinon.stub(multiSigWallet, 'getWalletUtxos').resolves({
                reservedUtxos: [],
                reservedBalance: 0,
                availableBalance: 100000,
                availableUtxos: testUtxos,
            });

            broadcastTransactionSpy = sinon.stub(esplora, 'postTransaction').resolves('txid');

            // Create an unsigned PSBT
            const unsignedResult = await multiSigWallet.createUnsignedWithdrawalTransaction({
                userPublicKey,
                recipientAddress,
                amountSats: 50000,
                feeSatsPerByte: 5
            });

            if (unsignedResult.error) {
                throw new Error(unsignedResult.error);
            }

            if (unsignedResult.psbtBase64 === undefined) {
                throw new Error('Expected PSBT to be returned');
            }
            
            // Replace stub's userPublicKey with our test key
            const psbt = bitcoin.Psbt.fromBase64(unsignedResult.psbtBase64, { network: networks.testnet });

            // Mock user signing the PSBT
            psbt.signInput(0, {
                publicKey: Buffer.from(userKeyPair.publicKey),
                sign: (hash: Buffer) => Buffer.from(userKeyPair.sign(hash))
            });
            
            psbtBase64 = psbt.toBase64();
        });
        
        it('should sign and finalize a user-signed PSBT', async () => {
            const result = await multiSigWallet.signAndFinalizeWithdrawalTransaction(userPublicKey, psbtBase64);
            
            expect(result).to.have.property('txHex');
            expect(result).to.have.property('txid');
            expect(result.txHex).to.be.a('string');
            expect(result.txid).to.be.a('string');

            if (result.txHex === undefined || result.txid === undefined) {
                throw new Error('Expected transaction hex and txid to be returned');
            }
            
            // Validate the transaction format
            const tx = bitcoin.Transaction.fromHex(result.txHex);
            expect(tx.ins.length).to.equal(1);
            expect(tx.outs.length).to.be.at.least(1);
            expect(tx.getId()).to.equal(result.txid);
            expect(broadcastTransactionSpy.calledOnce).to.be.true;
            expect(broadcastTransactionSpy.calledWith(result.txHex)).to.be.true;
        });

        it('should return error when an input is reserved', async () => {
            // Import the user's partially signed PSBT
            const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: bitcoin.networks.testnet });

            // Extract the txid:vout strings for each input in the PSBT
            const psbtInputs = [];
            for (let i = 0; i < psbt.txInputs.length; i++) {
                const input = psbt.txInputs[i];
                const txid = input.hash.reverse().toString('hex');
                const vout = input.index;
                psbtInputs.push(`${txid}:${vout}`);
            }

            getWalletUtxosSpy.reset();

            sinon.replace(multiSigWallet, 'getWalletUtxos', sinon.fake.resolves({
                reservedUtxos: [{
                    utxo: psbtInputs[0],
                }],
                reservedBalance: 0,
                availableBalance: 0,
                availableUtxos: [],
            }));

            const result = await multiSigWallet.signAndFinalizeWithdrawalTransaction(userPublicKey, psbtBase64);
            
            expect(result).to.have.property('error');
            expect(result).to.deep.equal({ error: 'Reserved input used in transaction' });
        });
    });

    describe('signAndFinalizeBidTransaction', () => {
        // Create user key pair for testing
        const userKeyPair = ECPair.makeRandom({ network: networks.testnet });
        const userPublicKey = Buffer.from(userKeyPair.publicKey).toString('hex');
        const recipientAddress = '2MvHSREkDwDfLg1K4aQiSm5kyoYL9SfGp1V';
        
        // Test UTXOs
        const testUtxos = [
            {
                "txid": "c46f5af3c95cd831150f555dff1429539b0234d2ca5e036a12f34dd62fe74b26",
                "vout": 0,
                "value": 3000,
                "status": {
                    "confirmed": true,
                    "block_height": 237963,
                    "block_hash": "0000000c472e070ad2e190cd2e9c3748b5d4b326a75600fbe49e86fa0adb22da",
                    "block_time": 1741168122
                }
            },
            {
                "txid": "003484a672f93ab4b6e4abd39937f0980af7594b20e1b120c657a6e57167f854",
                "vout": 0,
                "value": 1000,
                "status": {
                    "confirmed": true,
                    "block_height": 239751,
                    "block_hash": "000000ca1f30af7da6ab9bddcd78b78a370f273d1eef51379ed921504bbb41ed",
                    "block_time": 1742209553
                }
            },
            {
                "txid": "0b8b4c515b9ed63f5729768f9c72ee92dd181316470ed93362b12210ac752c66",
                "vout": 0,
                "value": 600,
                "status": {
                    "confirmed": true,
                    "block_height": 237964,
                    "block_hash": "000000e44a56bfe1175b8c1aa907e572b462559bf2734ec4ac3b84f8207dc35c",
                    "block_time": 1741168149
                }
            },
            {
                "txid": "5b470149c8542ef2ec6c8bc35f997843e50bd77f8d3303036ad3276dec74a22d",
                "vout": 0,
                "value": 600,
                "status": {
                    "confirmed": true,
                    "block_height": 237964,
                    "block_hash": "000000e44a56bfe1175b8c1aa907e572b462559bf2734ec4ac3b84f8207dc35c",
                    "block_time": 1741168149
                }
            },
            {
                "txid": "dda047ad48d2be64bd13d08dca44fa9f4a2a5c879bb446c6b4a90b7f345123c2",
                "vout": 0,
                "value": 4500,
                "status": {
                    "confirmed": true,
                    "block_height": 237967,
                    "block_hash": "0000012a2685b3a7f4c9cfdd1e61d8c5ab68bd4f25974e2d1bbef79c775c9008",
                    "block_time": 1741169215
                }
            },
            {
                "txid": "f234e193ab5a268ff0e5d3882b5aad049f84e6e6d0a22a905b8aab700dde4454",
                "vout": 0,
                "value": 600,
                "status": {
                    "confirmed": true,
                    "block_height": 238973,
                    "block_hash": "0000004cd9787a53ddb99b7c6efd8a1f7376e2d3a52f5bd1d0717373e6c9f755",
                    "block_time": 1741763715
                }
            }
        ];
        
        // Test database responses
        const testWalletData = [
            {
                account_index: 3,
                address_index: 0,
                user_public_key_hex: userPublicKey,
                reserved_balance: 1500
            }
        ];
        
        let getMultiSigWalletStub: sinon.SinonStub;
        let getWalletUtxosSpy: sinon.SinonStub;
        let psbtBase64: string;
        let bidData: BidDetailType;
        let orderbook: OrderDetailType;
        
        beforeEach(async () => {
            getMultiSigWalletStub = sinon.stub(supabase, 'getMultiSigWallet').resolves(testWalletData);

            getWalletUtxosSpy = sinon.stub(multiSigWallet, 'getWalletUtxos').resolves({
                reservedUtxos: [],
                reservedBalance: 0,
                availableBalance: 10300,
                availableUtxos: testUtxos,
            });

            // Create an unsigned PSBT
            const unsignedResult = await multiSigWallet.createUnsignedWithdrawalTransaction({
                userPublicKey,
                recipientAddress,
                amountSats: 7000,
                feeSatsPerByte: 1
            });

            if (unsignedResult.error) {
                throw new Error(unsignedResult.error);
            }

            if (unsignedResult.psbtBase64 === undefined) {
                throw new Error('Expected PSBT to be returned');
            }
            
            // Replace stub's userPublicKey with our test key
            const psbt = bitcoin.Psbt.fromBase64(unsignedResult.psbtBase64, { network: networks.testnet });

            // Mock user signing the PSBT
            // Sign all inputs except index 2
            for (let i = 0; i < psbt.data.inputs.length; i++) {
                if (i === 2) continue; // skip the maker input
                
                psbt.signInput(i, {
                    publicKey: Buffer.from(userKeyPair.publicKey),
                    sign: (hash: Buffer) => Buffer.from(userKeyPair.sign(hash))
                });
            }
            psbtBase64 = psbt.toBase64();

            bidData = { 
                auction_id: 1,
                bid_amount: 1500,
                expiry_time: 1741340760,
                final_signed_psbt: null,
                id: 1, 
                signed_psbt: psbtBase64,
                unsigned_psbt: unsignedResult.psbtBase64,
                marketplace_fee_collected_sats: 0,
                marketplace_taker_fee_collected_bips: 0,
                multi_sig_wallet_id: 2,
                platform_taker_fee_collected_bips: 0,
                platfrom_fee_collected_sats: 0,
                status: 'in_review',
                user_ordinal_address_id: 85,
                created_at: '2025-03-05 09:56:17.842068',
                updated_at: '2025-03-05 09:56:56.842068',
                multi_sig_wallet: {
                    derivation_path: "m/84'/1'/3'/0/0",
                    multisig_wallet_address_id: 77,
                    user_address_id: 1,
                    account_index: 3,
                    address_index: 0,
                    user_public_key_hex: userPublicKey,
                }
            }

            orderbook = {
                id: 1,
                psbt: { signed_psbt: "cHNidP8BAFMCAAAAATxjhEMTbT+Bibwfj+XGhPsqG6LhbFQGXnxVmHVKW8ELAQAAAAD/////AcYIAAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HAAAAAAABASsiAgAAAAAAACJRIPF+pE5+4fgDJyFvmtznshD3xhZ2+p7gp95auV9HqrnLAQMEgwAAAAETQTzZwMw6naGSWlb+JNIGPmcy+FcNVXoD+Capz802b8jG2WFtIUbKW8O/qEJzJnY/rUZYsxK35kyzid4M1sFBe4eDARcgWUpKr12lsUTQ+mtHmH2WYCnYkvvErrsjIUhT6LBTcC4AAA==" },
                listing_type: 'auction',
                utxos: {
                    id: 2,
                    utxo: "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1"
                },
                index_in_maker_psbt: 0
            } as OrderDetailType
        });
        
        it('should sign and finalize a user-signed PSBT', async () => {
            const result = await multiSigWallet.signAndFinalizeBidsTransaction(bidData, orderbook);
            expect(result).to.have.property('txHex');
            expect(result).to.have.property('txid');
            expect(result.txHex).to.be.a('string');
            expect(result.txid).to.be.a('string');

            if (result.txHex === undefined || result.txid === undefined) {
                throw new Error('Expected transaction hex and txid to be returned');
            }
            
            // Validate the transaction format
            const tx = bitcoin.Transaction.fromHex(result.txHex);
            expect(tx.ins.length).to.equal(5);
            expect(tx.outs.length).to.be.at.least(2);
            expect(tx.getId()).to.equal(result.txid);
        });
    });
});