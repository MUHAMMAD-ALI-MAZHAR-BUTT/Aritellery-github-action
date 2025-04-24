import { expect } from 'chai';
import sinon, { SinonFakeTimers } from 'sinon';
import auctionModel from '../model/data/auction';
import Supabase from '../model/supabase';
import { Database } from '../database.types';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSupabaseResponse } from './helpers';
import * as bitcoinjs from 'bitcoinjs-lib';
import Esplora from '../api/esplora';
import OrdExplorer from '../api/ordExplorer';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import SatScanner from '../api/satscanner';
import Opi from '../api/opi';
import TransactionListener from '../model/transactionListener';
import WebhookSender from '../api/webhookSender';
import MultiSigWallet from '../model/multiSigWallet';
import Auction from '../model/data/auction';
import { AUCTION_STATUS, ORDERBOOK_STATUS } from '../conf/constants';
chai.use(chaiAsPromised);

describe('Auctions', () => {
  let auctionModel: auctionModel;
  let supabase: Supabase;
  let esplora: Esplora;
  let ordExplorer: OrdExplorer;
  let satScanner: SatScanner;
  let opi: Opi;
  let webhookSender: WebhookSender;
  let transactionListener: TransactionListener;
  const seed = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
  let multiSigWallet: MultiSigWallet;

  let clock: SinonFakeTimers;

  //common stubs
  let getMultiSigWalletStub: sinon.SinonStub;
  let getAddressUtxosStub: sinon.SinonStub;
  let getMultiSigWalletReservedUtxosStub: sinon.SinonStub;


  beforeEach(() => {
    ordExplorer = new OrdExplorer("https://testnet-explorer.ordinalsbot.com");
    esplora = new Esplora("https://esplora:80");
    satScanner = new SatScanner("http://satscanner:3000");
    opi = new Opi("http://opi-indexer-brc20-api:3000");
    supabase = new Supabase({ supabase: {} as SupabaseClient<Database>, platformFeeAddress: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' });
    webhookSender = new WebhookSender({ orderWebhookUrl: 'https://mock.com/webhook', svixAuthToken: 'mock-secret' });
    transactionListener = new TransactionListener({ supabase, esplora, webhookSender });

    multiSigWallet = new MultiSigWallet({
      supabase,
      seed,
      network: bitcoinjs.networks.testnet,
      esplora,
    });

    auctionModel = new Auction({
      supabase,
      transactionListener,
      ordExplorer,
      esplora,
      satScanner,
      opi,
      minimumFeeAmount: 546,
      network: bitcoinjs.networks.testnet,
      makerFee: 499,
      transferFee: 4999,
      takerFee: 499,
      secondsToWaitForTakerToSign: 60,
      secondsToWaitForMakerToSign: 60,
      maxInscriptionBatchSize: 5,
      multiSigWallet
    });

    const originalTime = new Date("2025-02-19T12:05:24.346Z");
    clock = sinon.useFakeTimers(originalTime.getTime());

    getMultiSigWalletStub = sinon.stub(supabase, 'getMultiSigWallet');
    getAddressUtxosStub = sinon.stub(esplora, 'getAddressUtxos');
    getMultiSigWalletReservedUtxosStub = sinon.stub(supabase, 'getMultiSigWalletReservedUtxos');
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  describe('#getAuctionDetails()', () => {
    let getAuctionDetailsStub: sinon.SinonStub;
    beforeEach(() => {
      getAuctionDetailsStub = sinon.stub(supabase, 'getAuctionDetails');
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should return error response when auction is not found', async () => {
      getAuctionDetailsStub.resolves({ data: null, error: new Error('auction not found') });

      const result = await auctionModel.getAuctionDetails(1, 'marketplace-123');
      expect(result).to.deep.equal({ error: 'auction not found', success: false });
    });

    it('should return auction details with zero bids when no bids exist', async () => {
      getAuctionDetailsStub.resolves({ data: { id: 1, reserve_price: 100, bids: [] }, error: null });

      const result = await auctionModel.getAuctionDetails(1, 'marketplace-123');
      expect(result).to.deep.equal({ id: 1, reserve_price: 100, bids: [], winningBid: null });
    });

    it('should return highest valid bid details when bids exist', async () => {
      getAuctionDetailsStub.resolves({
        data: {
          id: 1,
          reserve_price: 100,
          bids: [
            { id: 1, bid_amount: 500, status: 'in_review', created_at: '2025-03-13T05:00:17.751676',  multi_sig_wallet: { multisig_wallet_address: { address: 'wallet-1' } } },
            { id: 2, bid_amount: 700, status: 'in_review', created_at: '2025-03-13T05:01:17.751676', multi_sig_wallet: { multisig_wallet_address: { address: 'wallet-2' } } },
            { id: 3, bid_amount: 300, status: 'pending_first_signature', created_at: '2025-03-13T05:02:17.751676', multi_sig_wallet: { multisig_wallet_address: { address: 'wallet-3' } } }
          ]
        },
        error: null
      });

      const result = await auctionModel.getAuctionDetails(1, 'marketplace-123');
      expect(result).to.deep.equal({
        id: 1,
        reserve_price: 100,
        bids: [
          { id: 1, bid_amount: 500, wallet: 'wallet-1', created_at: 1741842017 },
          { id: 2, bid_amount: 700, wallet: 'wallet-2', created_at: 1741842077 },
          { id: 3, bid_amount: 300, wallet: 'wallet-3', created_at: 1741842137 }
        ],
        winningBid: { id: 2, bid_amount: 700, wallet: 'wallet-2', created_at: 1741842077  }
      });
    });

    it('should return auction details with bids count when no valid winning bid is found', async () => {
      getAuctionDetailsStub.resolves({
        data: {
          id: 1,
          start_price: 500,
          reserve_price: 750,
          bids: [
            { id: 1, bid_amount: 500, status: 'in_review', created_at: '2025-03-13T05:00:17.751676', multi_sig_wallet: { multisig_wallet_address: { address: 'wallet-1' } } },
            { id: 2, bid_amount: 700, status: 'in_review', created_at: '2025-03-13T05:01:17.751676', multi_sig_wallet: { multisig_wallet_address: { address: 'wallet-2' } } }
          ]
        },
        error: null
      });

      const result = await auctionModel.getAuctionDetails(1, 'marketplace-123');
      expect(result).to.deep.equal({
        id: 1,
        reserve_price: 750,
        start_price: 500,
        bids: [
          { id: 1, bid_amount: 500, wallet: 'wallet-1', created_at: 1741842017 },
          { id: 2, bid_amount: 700, wallet: 'wallet-2', created_at: 1741842077 }
        ],
        winningBid: null
      });
    });
  });

  describe('#getAuctions()', () => {
    let getAuctionsStub: sinon.SinonStub;
    beforeEach(() => {
      getAuctionsStub = sinon.stub(supabase, 'getAuctions');
    });
    const request = {
      "queryFilters": {
        "status": "active"
      },
      "page": 1,
      "itemsPerPage": 50,
      "sort": "id"
    };

    it('should return auctions with pagination details when auctions exist', async () => {
      const mockData = [
        {
          "id": 1,
          "start_price": 1500,
          "reserve_price": null,
          "start_time": 1741333440,
          "end_time": 1741828331,
          "status": "active",
          "meta_data": {
            "name": "test auction",
            "slug": "test auction",
            "description": "test auction"
          },
          "slug": "first-auction",
          "orderbook": {
            "utxos": {
              "utxo": "d895d7efe84544860c249b8d8a3331f997723de8ae5d4f15470f4e19f6b3674a:1",
              "utxo_contents": [
                {
                  "inscriptions": {
                    "inscription_id": "3844214fae5a67a56f1b3d1ba18872e96a7af5d86715c65cb78c3464c4e76f44i0"
                  }
                }
              ]
            }
          }
        },
        {
          "id": 2,
          "start_price": 1800,
          "reserve_price": 2000,
          "start_time": 1741333440,
          "end_time": 1741828331,
          "status": "active",
          "meta_data": {
            "name": "test second auction",
            "slug": "test second auction",
            "description": "test second auction"
          },
          "slug": "second-auction",
          "orderbook": {
            "utxos": {
              "utxo": "ec5ffaeda763b2eaa64afa8c25df35e8e3cc7cf7c5eb07249bf9e3f649ad05d3:0",
              "utxo_contents": [
                {
                  "inscriptions": {
                    "inscription_id": "ec5ffaeda763b2eaa64afa8c25df35e8e3cc7cf7c5eb07249bf9e3f649ad05d3i0"
                  }
                }
              ]
            }
          }
        }
      ];
      getAuctionsStub.resolves(toSupabaseResponse(mockData, null));
      const result = await auctionModel.getAuctions(request.queryFilters, request.page, request.itemsPerPage, request.sort);
      expect(result).to.deep.equal({
        results: mockData,
        count: 2,
        currentPage: 1,
        totalPages: 1,
        totalItems: 2
      });
      expect(getAuctionsStub.calledOnce).to.be.true;
    });

    it('should return an empty auctions array when no auction exist', async () => {
      getAuctionsStub.resolves(toSupabaseResponse([], null));
      const result = await auctionModel.getAuctions(request.queryFilters, request.page, request.itemsPerPage, request.sort);

      expect(result).to.deep.equal({
        results: [],
        count: 0,
        currentPage: 1,
        totalPages: 0,
        totalItems: 0
      });
      expect(getAuctionsStub.calledOnce).to.be.true;
    });
  });

  describe('#createMultisigDummyOutputsPSBT()', () => {
    
    const request = {
      multiSigAddress: "tb1qmfrzryc27cu0d0sld86xhq4hvp948dzltj55g9hs2c222yskdsds4mcs47",
      userPublicKey: "033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c05",
      witnessScript: "5221026f1693a402886969cda5823d90e0a65f5044b9c6980204d959b7c4d3adf0308721033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0552ae",
      numberOfOutputs: 2,
      feeRate: 1
    }

    afterEach(() => {
      sinon.restore();
    });
  
    it('should return error if fetching user wallet data fails', async () => {
      
      getMultiSigWalletStub.resolves([]);

      sinon.stub(multiSigWallet, 'fetchUserWallet').resolves({ error: 'User wallet not found'});
  
      const result = await auctionModel.createMultisigDummyOutputsPSBT(
        request.multiSigAddress,
        request.userPublicKey,
        request.witnessScript,
        request.feeRate,
        request.numberOfOutputs
      );

      expect(result).to.have.property('error').that.equals('User wallet not found');
    });
  
    it('should throw error if address_index is null', async () => {
      
      getMultiSigWalletStub.resolves([{
        account_index: 1,
        user_public_key_hex: request.userPublicKey,
        address_index: null,
        reserved_balance: 1500
      }]);

      await expect(auctionModel.createMultisigDummyOutputsPSBT(
        request.multiSigAddress,
        request.userPublicKey,
        request.witnessScript,
        request.feeRate,
        request.numberOfOutputs
      )).to.be.rejectedWith('Invalid address index');
    });
  
    it("should return error if wallet doesn't have enough funds", async () => {
      
      getMultiSigWalletStub.resolves([{
        account_index: 1,
        user_public_key_hex: request.userPublicKey,
        address_index: 1,
        reserved_balance: 1500
      }]);

      getMultiSigWalletReservedUtxosStub.resolves([]);
      getAddressUtxosStub.resolves([]);
      
      const result = await auctionModel.createMultisigDummyOutputsPSBT(
        request.multiSigAddress,
        request.userPublicKey,
        request.witnessScript,
        request.feeRate,
        request.numberOfOutputs
      );
      expect(result).to.have.property('error').that.equals("Your wallet address doesn't have enough funds for padding outputs");
    });
  
    it('should return error if final fees calculation results in insufficient funds', async () => {

      getMultiSigWalletStub.resolves([{
        account_index: 1,
        user_public_key_hex: request.userPublicKey,
        address_index: 1,
        reserved_balance: 1500
      }]);

      getMultiSigWalletReservedUtxosStub.resolves([]);
      getAddressUtxosStub.resolves([{
        txid: "f234e193ab5a268ff0e5d3882b5aad049f84e6e6d0a22a905b8aab700dde4454",
        vout: 0,
        value: 600,
        status: {
          confirmed: true,
          block_height: 238973,
          block_hash: "0000004cd9787a53ddb99b7c6efd8a1f7376e2d3a52f5bd1d0717373e6c9f755",
          block_time: 1741763715
        }
      }]);
      
      const result = await auctionModel.createMultisigDummyOutputsPSBT(
        request.multiSigAddress,
        request.userPublicKey,
        request.witnessScript,
        request.feeRate,
        request.numberOfOutputs
      );
  
      expect(result).to.have.property('error').that.equals("Your wallet address doesn't have enough funds for padding outputs");
    });
  }); 
  
  describe('#updateAndDeclareAuctionWinner()', () => {
    let getAuctionsToFinalizeStub: sinon.SinonStub;
    let getHighestBidForAuctionStub: sinon.SinonStub;
    let updateAuctionStub: sinon.SinonStub;
    let updateOrderbookByIdsStub: sinon.SinonStub;
    let declinedAuctionBidsStub: sinon.SinonStub;
    let releaseWalletUtxosStub: sinon.SinonStub;
    let signAndFinalizeBidsTransactionStub: sinon.SinonStub;
    let getTransactionStub: sinon.SinonStub;
    let getRawTransactionStub: sinon.SinonStub;
    let postTransactionStub: sinon.SinonStub;
    let processAuctionWinnerStub: sinon.SinonStub;
    let updateTradeHistoryStub: sinon.SinonStub;

    beforeEach(() => {
      getAuctionsToFinalizeStub = sinon.stub(supabase, 'getAuctionsToFinalize');
      getHighestBidForAuctionStub = sinon.stub(supabase, 'getHighestBidForAuction');
      updateAuctionStub = sinon.stub(supabase, 'updateAuction');
      updateOrderbookByIdsStub = sinon.stub(supabase, 'updateOrderbookByIds');
      updateTradeHistoryStub = sinon.stub(supabase, 'updateTradeHistory');
      declinedAuctionBidsStub = sinon.stub(supabase, 'declinedAuctionBids');
      releaseWalletUtxosStub = sinon.stub(multiSigWallet, 'releaseWalletUtxos');
      signAndFinalizeBidsTransactionStub = sinon.stub(multiSigWallet, 'signAndFinalizeBidsTransaction');
      getTransactionStub = sinon.stub(esplora, 'getTransaction');
      postTransactionStub = sinon.stub(esplora, 'postTransaction');
      getRawTransactionStub = sinon.stub(esplora, 'getRawTransaction');
      processAuctionWinnerStub = sinon.stub(supabase, 'processAuctionWinner');
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should handle the case where no auctions are available for finalization', async () => {
      getAuctionsToFinalizeStub.resolves({ data: [], error: null });

      await auctionModel.updateAndDeclareAuctionWinner();

      expect(getAuctionsToFinalizeStub.calledOnce).to.be.true;
    });

    it('should handle an auction with no winning bid and mark it as ended', async () => {
      const auction = { id: 1, order_id: 101 };
      getAuctionsToFinalizeStub.resolves({ data: [auction], error: null });
      getHighestBidForAuctionStub.resolves({ data: null, error: new Error('auction not found') });
      updateAuctionStub.resolves({});
      updateOrderbookByIdsStub.resolves({});
      declinedAuctionBidsStub.resolves({ data: [], error: null });

      await expect(auctionModel.updateAndDeclareAuctionWinner()).to.be.rejectedWith(
        `No winning bid found for auction ID ${auction.id}`
      );

      expect(updateAuctionStub.calledOnceWithExactly({ id: auction.id }, { status: AUCTION_STATUS.ended })).to.be.true;
      expect(updateOrderbookByIdsStub.calledOnceWithExactly({ status: ORDERBOOK_STATUS.canceled }, [auction.order_id])).to.be.true;
      expect(declinedAuctionBidsStub.notCalled).to.be.true;
      expect(releaseWalletUtxosStub.notCalled).to.be.true;
    });

    it('should handle an auction where the highest bid is below the reserve price', async () => {
      const auction = { id: 2, order_id: 202, reserve_price: 100 };
      const bid = { id: 201, bid_amount: 90 };

      getAuctionsToFinalizeStub.resolves({ data: [auction], error: null });
      getHighestBidForAuctionStub.resolves({ data: bid, error: null });
      updateAuctionStub.resolves({});
      updateOrderbookByIdsStub.resolves({});
      declinedAuctionBidsStub.resolves({ data: [{ id: 301 }], error: null });
      releaseWalletUtxosStub.resolves({});

      await auctionModel.updateAndDeclareAuctionWinner();

      expect(updateAuctionStub.calledOnceWithExactly({ id: auction.id }, { status: AUCTION_STATUS.ended })).to.be.true;
      expect(updateOrderbookByIdsStub.calledOnceWithExactly({ status: ORDERBOOK_STATUS.canceled }, [auction.order_id])).to.be.true;
      expect(declinedAuctionBidsStub.calledOnceWithExactly(auction.id, -1)).to.be.true;
      expect(releaseWalletUtxosStub.calledOnceWithExactly([301])).to.be.true;
    });

    it('should successfully finalize an auction when a valid winning bid exists', async () => {
      const auction = { id: 3, order_id: 303, reserve_price: 100, orderbook: { id: 404, utxos: { utxo: "some-utxo" } } };
      const bid = { id: 302, bid_amount: 110 };

      getAuctionsToFinalizeStub.resolves({ data: [auction], error: null });
      getHighestBidForAuctionStub.resolves({ data: bid, error: null });
      signAndFinalizeBidsTransactionStub.resolves({ txHex: "fake-tx-hex" });
      postTransactionStub.resolves("fake-tx-id");
      processAuctionWinnerStub.resolves({});
      getTransactionStub.resolves({
        "fee": 556
      });
      getRawTransactionStub.resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000");
      updateTradeHistoryStub.resolves({});
      declinedAuctionBidsStub.resolves({ data: [{ id: 501 }], error: null });
      releaseWalletUtxosStub.resolves({});

      await auctionModel.updateAndDeclareAuctionWinner();

      expect(signAndFinalizeBidsTransactionStub.calledOnceWithExactly(bid, auction.orderbook)).to.be.true;
      expect(postTransactionStub.calledOnceWithExactly("fake-tx-hex")).to.be.true;
      expect(processAuctionWinnerStub.calledOnceWithExactly(auction.id, bid.id, "fake-tx-id")).to.be.true;
      expect(declinedAuctionBidsStub.calledOnceWithExactly(auction.id, bid.id)).to.be.true;
      expect(releaseWalletUtxosStub.calledOnceWithExactly([501])).to.be.true;
    });

    it('should throw an error if txHex is missing when finalizing an auction', async () => {
      const auction = { id: 4, order_id: 404, reserve_price: 100, orderbook: { id: 505 } };
      const bid = { id: 403, bid_amount: 120 };

      getAuctionsToFinalizeStub.resolves({ data: [auction], error: null });
      getHighestBidForAuctionStub.resolves({ data: bid, error: null });
      signAndFinalizeBidsTransactionStub.resolves({ txHex: null });

      await expect(auctionModel.updateAndDeclareAuctionWinner()).to.be.rejectedWith("txHex not found");

      expect(signAndFinalizeBidsTransactionStub.calledOnceWithExactly(bid, auction.orderbook)).to.be.true;
    });
  });
});