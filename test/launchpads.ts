import { expect } from 'chai';
import sinon from 'sinon';
import Supabase from '../model/supabase';
import { Database, Tables } from '../database.types';
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
import LaunchpadListing from '../model/data/launchpadListing';
import DataImporter from '../model/data/importer';
import Slack from '../api/slack';
import { LAUNCHPAD_STATUS, ORDERBOOK_STATUS, ORDERBOOK_TYPE, PHASE_BATCH_STATUS, TRADE_HISTORY_STATUS } from '../conf/constants';
import { ProccessedInscription, CollectionData } from '../model/data/types';
import { CollectionMeta } from '../model/data/types';
import { Queue } from 'bullmq';
import WebhookSender from '../api/webhookSender';

chai.use(chaiAsPromised);

describe('Launchpads', () => {
  let launchpadListing: LaunchpadListing;
  let supabase: Supabase;
  let esplora: Esplora;
  let webhookSender: WebhookSender;
  let ordExplorer: OrdExplorer;
  let satScanner: SatScanner;
  let opi: Opi;
  let transactionListener: TransactionListener;
  let dataImporter: DataImporter;
  let getOrInsertAddressStub: sinon.SinonStub;
  let slack: Slack;
  let launchpadQueue: Queue;
  beforeEach(() => {
    ordExplorer = new OrdExplorer("https://testnet-explorer.ordinalsbot.com");
    esplora = new Esplora("https://esplora:80");
    satScanner = new SatScanner("http://satscanner:3000");
    opi = new Opi("http://opi-indexer-brc20-api:3000");
    supabase = new Supabase({ supabase: {} as SupabaseClient<Database>, platformFeeAddress: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' });
    webhookSender = new WebhookSender({orderWebhookUrl: 'https://mock.com/webhook', svixAuthToken: 'mock-secret'});
    transactionListener = new TransactionListener({ supabase, esplora, webhookSender });
    dataImporter = new DataImporter({
      supabase
    });
    slack = new Slack('https://slack.com', 'test-token');
    launchpadQueue = sinon.createStubInstance(Queue);

    launchpadListing = new LaunchpadListing({
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
      maxInscriptionBatchSize: 3,
      dataImporter,
      slack,
      launchpadQueue
    });
    getOrInsertAddressStub = sinon.stub(supabase, 'getOrInsertAddress');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('#getListings()', () => {
    let getLaunchpadsStub: sinon.SinonStub;
    beforeEach(() => {
      getLaunchpadsStub = sinon.stub(supabase, 'getLaunchpads');
    });
    const request = {
      "queryFilters": {
        "status": "active"
      },
      "page": 1,
      "itemsPerPage": 50,
      "sort": "id"
    };

    it('should return launchpads with pagination details when listings exist', async () => {
      const mockData = [
        {
          "id": 1,
          "maker_payment_address_id": 3,
          "status": "active",
          "meta_data": "{\"title\":\"test launchpad 01\",\"description\":\"test launchpad 01\"}",
          "phases": [
            {
              "id": 1,
              "name": "Early bird",
              "price": 1500,
              "status": "active",
              "end_date": 1729621810,
              "is_public": false,
              "start_date": 1729621800,
              "launchpad_id": 1,
              "phase_number": 1,
              "total_inscriptions": 10,
              "remaining_inscriptions": 10
            },
            {
              "id": 2,
              "name": "Moon chand Era",
              "price": 2500,
              "status": "active",
              "end_date": 1730593665,
              "is_public": false,
              "start_date": 1730507265,
              "launchpad_id": 1,
              "phase_number": 2,
              "total_inscriptions": 10,
              "remaining_inscriptions": 10
            }
          ]
        }
      ];
      getLaunchpadsStub.resolves(toSupabaseResponse(mockData, null));
      const result = await launchpadListing.getAllLaunchpads(request.queryFilters, request.page, request.itemsPerPage, request.sort);
      expect(result).to.deep.equal({
        results: mockData,
        count: 1,
        currentPage: 1,
        totalPages: 1,
        totalItems: 1
      });
      expect(getLaunchpadsStub.calledOnce).to.be.true;
    });

    it('should return an empty launchpads array when no listings exist', async () => {
      getLaunchpadsStub.resolves(toSupabaseResponse([], null));
      const result = await launchpadListing.getAllLaunchpads(request.queryFilters, request.page, request.itemsPerPage, request.sort);

      expect(result).to.deep.equal({
        results: [],
        count: 0,
        currentPage: 1,
        totalPages: 0,
        totalItems: 0
      });
      expect(getLaunchpadsStub.calledOnce).to.be.true;
    });
  });

  describe('#createLaunchpad', () => {
    let createLaunchpadStub: sinon.SinonStub;
    let updateLaunchpadByIdStub: sinon.SinonStub;
    beforeEach(() => {
      createLaunchpadStub = sinon.stub(supabase, "createLaunchpad");
      updateLaunchpadByIdStub = sinon.stub(supabase, "updateLaunchpadById");
    });

    it('should create a launchpad', async () => {
      const slug = "slug";
      const makerPaymentAddress = "some-address";
      const makerPaymentPublicKey = "some-address-pblic-key";
      const marketplaceId = "some-marketplace-id";
      const metaData = {
        name: "name",
        slug: "slug",
        description: "description",
        icon: "icon",
        discord_link: "discord_link",
        twitter_link: "twitter_link",
        website_link: "website_link",
        banner_image: "banner_image"
      } as CollectionMeta;

      getOrInsertAddressStub.resolves(1);

      createLaunchpadStub.resolves({
        id: 1,
        maker_payment_address_id: 1
      });

      // Call the method
      const result = await launchpadListing.create(
        slug,
        makerPaymentAddress,
        makerPaymentPublicKey,
        marketplaceId,
        metaData,
        10
      );

      // Check if the result contains the expected structure
      expect(result).to.be.an('object');
      expect(result).to.have.property('id').that.is.a('number');
      expect(result).to.have.property('maker_payment_address_id').that.is.a('number');
      expect(result).to.deep.equal({
        id: 1,
        maker_payment_address_id: 1
      });

      expect(getOrInsertAddressStub.calledOnce).to.be.true;
      expect(createLaunchpadStub.calledOnce).to.be.true;
    });

    describe('createLaunchpadPhases()', () => {
      const launchpadId = 1;
      const inscriptions = [
        { id: 'inscription1' },
        { id: 'inscription2' },

      ];
      const phases = [
        {
          name: 'Phase 1',
          allowList: [
            {
              address: 'address1',
              allocation: 4
            }
          ],
          isPublic: 0,
          price: 1000,
          startDate: 1729621800,
          endDate: 1729621810,
        },
        {
          name: 'Phase 2',
          isPublic: 1,
          price: 1500,
          startDate: 1730507265,
          endDate: 1730593665,
        }
      ];

      const makerPaymentAddress = 'makerPaymentAddress';
      const makerPaymentAddressId = 1;
      const makerOrdinalAddress = 'makerOrdinalAddress';
      const makerOrdinalPublicKey = 'makerOrdinalPublicKey';
      const marketplaceObj = {
        "api_key": 'api-key',
        "id": 'marketplace-id',
        "launchpad_fee_btc_address_id": 1,
        "launchpad_maker_fee": 499,
        "launchpad_taker_fee": 499,
        "marketplace_fee_btc_address_id": 1,
        "marketplace_maker_fee": 499,
        "marketplace_taker_fee": 499,
        "name": 'marketplace'
      } as Tables<'marketplaces'>;

      it('should create a launchpad phases with multiple phases and mark the launchpad status to pending_psbt_signature', async () => {
      
        const proccessInscriptionsStub = sinon.stub(launchpadListing, 'proccessInscriptions').resolves([
          {
            utxoId: 1,
            output: "utxoId:0",
            value: 4500,
            address: "tb1...1",
            makerOrdinalAddressId: 2,
            rawTransaction: "tx.......qwe",
          },
          {
            utxoId: 2,
            output: "utxoId:2",
            value: 4600,
            address: "tb1...1",
            makerOrdinalAddressId: 2,
            rawTransaction: "tx......qasw",
          }
        ]);

        const createLaunchpadPhaseStub = sinon.stub(supabase, 'createLaunchpadPhase')
          .onFirstCall().resolves({ id: 1 } as Tables<'launchpad_phases'>)
          .onSecondCall().resolves({ id: 1 } as Tables<'launchpad_phases'>)

        const createPhaseInscriptionsStub = sinon.stub(launchpadListing, 'createPhaseInscriptions').resolves(void 0);

        const createPhaseAllowListStub = sinon.stub(launchpadListing, 'createPhaseAllowList')
          .onFirstCall().resolves(void 0);
        
        updateLaunchpadByIdStub.resolves({ data: { id: 1, status: LAUNCHPAD_STATUS.pending_psbt_signature }, error: null });

        await launchpadListing.createLaunchpadPhases(
          launchpadId,
          inscriptions,
          phases,
          makerPaymentAddress,
          makerPaymentAddressId,
          makerOrdinalAddress,
          makerOrdinalPublicKey,
          marketplaceObj
        );

        expect(proccessInscriptionsStub.calledOnce).to.be.true;
        expect(createLaunchpadPhaseStub.calledTwice).to.be.true;
        expect(createPhaseInscriptionsStub.calledTwice).to.be.true;
        expect(createPhaseAllowListStub.calledOnce).to.be.true;
        expect(updateLaunchpadByIdStub.calledOnceWithExactly(
          1,  // launchpadId
          { status: LAUNCHPAD_STATUS.pending_psbt_signature }  // data being update
        )).to.be.true;
      });
      
      it('should throw an error and mark the launchpad status to failed with the failed reason', async () => {
        
        const getInscriptionInfoByIdStub = sinon.stub(ordExplorer, 'getInscriptionInfoById')
          .onFirstCall().resolves({
            "address": "bc1q...",
            "charms": [],
            "children": [],
            "content_length": 4,
            "content_type": "text/plain;charset=utf-8",
            "effective_content_type": "text/plain;charset=utf-8",
            "fee": 139,
            "height": 2572093,
            "id": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32bi0",
            "next": "8c521217e747f3be95e267860b80ea344935d6679c4498eadce9500d2e2e312ci0",
            "number": 767452,
            "parents": [],
            "previous": "866b128dd0d292faa2a2cb8e7c346a7af7f280a5ae356aea1374463f9f9bfa25i0",
            "rune": null,
            "sat": 1421505156510708,
            "satpoint": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0:0",
            "timestamp": 1704849671,
            "value": 1000,
            "output": "txid:0",
            "location": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0:0",
          })
          .onSecondCall().resolves({
            "address": "bc1q...",
            "charms": [],
            "children": [],
            "content_length": 4,
            "content_type": "text/plain;charset=utf-8",
            "effective_content_type": "text/plain;charset=utf-8",
            "fee": 139,
            "height": 2572093,
            "id": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340i0",
            "next": "21c930d844ebc3a844ca8463a0d5177a421a0d26311647151c7845a1de585a43i0",
            "number": 767454,
            "parents": [],
            "previous": "8c521217e747f3be95e267860b80ea344935d6679c4498eadce9500d2e2e312ci0",
            "rune": null,
            "sat": 1421505156112849,
            "satpoint": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0:0",
            "timestamp": 1704849671,
            "value": 3000,
            "output": "txid:2",
            "location": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0:0"
          });

        
        updateLaunchpadByIdStub.resolves({ data: { id: 1, status: LAUNCHPAD_STATUS.pending_psbt_signature }, error: null });

        await expect(
          launchpadListing.createLaunchpadPhases(
            launchpadId,
            inscriptions,
            phases,
            makerPaymentAddress,
            makerPaymentAddressId,
            makerOrdinalAddress,
            makerOrdinalPublicKey,
            marketplaceObj
          )
        ).to.be.rejectedWith('utxo address mismatch');

        expect(getInscriptionInfoByIdStub.calledOnce).to.be.true;
        expect(updateLaunchpadByIdStub.calledOnceWithExactly(
          1,  // launchpadId
          { status: LAUNCHPAD_STATUS.failed, failed_reason: 'utxo address mismatch' }  // data being update
        )).to.be.true;
      });
    });

    describe('divideInscriptionsToBatches()', () => {
      it("should divide inscriptions into correct batches", () => {
        const inscriptions: ProccessedInscription[] = [
          { utxoId: 1, output: "utxoId:0", value: 4500, address: "tb1...1", makerOrdinalAddressId: 2, rawTransaction: "tx.......qwe", },
          { utxoId: 2, output: "utxoId:1", value: 5500, address: "tb1...1", makerOrdinalAddressId: 2, rawTransaction: "tx.......asd", },
          { utxoId: 3, output: "utxoId:2", value: 6500, address: "tb1...1", makerOrdinalAddressId: 2, rawTransaction: "tx.......zxc", },
          { utxoId: 4, output: "utxoId:3", value: 7500, address: "tb1...1", makerOrdinalAddressId: 2, rawTransaction: "tx.......ert", },
          { utxoId: 5, output: "utxoId:4", value: 8500, address: "tb1...1", makerOrdinalAddressId: 2, rawTransaction: "tx.......rty", },
        ];
        const result = launchpadListing.divideInscriptionsToBatches(inscriptions);
        expect(result).to.deep.equal([
          [
            { utxoId: 1, output: "utxoId:0", value: 4500, address: "tb1...1", makerOrdinalAddressId: 2, rawTransaction: "tx.......qwe", },
            { utxoId: 2, output: "utxoId:1", value: 5500, address: "tb1...1", makerOrdinalAddressId: 2, rawTransaction: "tx.......asd", },
            { utxoId: 3, output: "utxoId:2", value: 6500, address: "tb1...1", makerOrdinalAddressId: 2, rawTransaction: "tx.......zxc", }
          ],
          [
            { utxoId: 4, output: "utxoId:3", value: 7500, address: "tb1...1", makerOrdinalAddressId: 2, rawTransaction: "tx.......ert", },
            { utxoId: 5, output: "utxoId:4", value: 8500, address: "tb1...1", makerOrdinalAddressId: 2, rawTransaction: "tx.......rty", },
          ],
        ]);
      });

      it("should return an empty array when there are no inscriptions", () => {
        const inscriptions: ProccessedInscription[] = [];
        const result = launchpadListing.divideInscriptionsToBatches(inscriptions);
        expect(result).to.deep.equal([]);
      });
    });

    describe('proccessInscriptions()', () => {
      let inscriptions: CollectionData;
      let makerOrdinalPublicKey: string;
      let getUtxoContentsStub: sinon.SinonStub;
      beforeEach(() => {
        inscriptions = [
          { id: 'inscription1' },
          { id: 'inscription2' }
        ];
        makerOrdinalPublicKey = 'makerPublicKey';
        getUtxoContentsStub = sinon.stub(supabase, "getUtxoContents");
      });

      it('should process inscriptions correctly', async () => {
        const makerPaymentAddress = '3N6....';
        const makerOrdinalAddress = 'bc1q...';
        const getInscriptionInfoByIdStub = sinon.stub(ordExplorer, 'getInscriptionInfoById')
          .onFirstCall().resolves({
            "address": "bc1q...",
            "charms": [],
            "children": [],
            "content_length": 4,
            "content_type": "text/plain;charset=utf-8",
            "effective_content_type": "text/plain;charset=utf-8",
            "fee": 139,
            "height": 2572093,
            "id": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32bi0",
            "next": "8c521217e747f3be95e267860b80ea344935d6679c4498eadce9500d2e2e312ci0",
            "number": 767452,
            "parents": [],
            "previous": "866b128dd0d292faa2a2cb8e7c346a7af7f280a5ae356aea1374463f9f9bfa25i0",
            "rune": null,
            "sat": 1421505156510708,
            "satpoint": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0:0",
            "timestamp": 1704849671,
            "value": 1000,
            "output": "txid:0",
            "location": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0:0",
          })
          .onSecondCall().resolves({
            "address": "bc1q...",
            "charms": [],
            "children": [],
            "content_length": 4,
            "content_type": "text/plain;charset=utf-8",
            "effective_content_type": "text/plain;charset=utf-8",
            "fee": 139,
            "height": 2572093,
            "id": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340i0",
            "next": "21c930d844ebc3a844ca8463a0d5177a421a0d26311647151c7845a1de585a43i0",
            "number": 767454,
            "parents": [],
            "previous": "8c521217e747f3be95e267860b80ea344935d6679c4498eadce9500d2e2e312ci0",
            "rune": null,
            "sat": 1421505156112849,
            "satpoint": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0:0",
            "timestamp": 1704849671,
            "value": 3000,
            "output": "txid:2",
            "location": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0:0"
          });

        getOrInsertAddressStub.resolves(1);

        const createUtxoStub = sinon.stub(supabase, 'createUtxo')
          .onFirstCall()
          .resolves({ id: 1, utxo: 'txid:0', is_spent: false })
          .onSecondCall()
          .resolves({ id: 2, utxo: 'txid:2', is_spent: false })

        const createInscriptionStub = sinon.stub(supabase, 'createInscription')
          .onFirstCall()
          .resolves({ 
            id: 1, 
            inscription_id: 'c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0',
            collection_id: null, 
            content_url: null, 
            file_type: null, 
            name: null,
            thumbnail_url: null
          })
          .onSecondCall()
          .resolves({ 
            id: 2, 
            inscription_id: 'e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0',
            collection_id: null, 
            content_url: null, 
            file_type: null, 
            name: null,
            thumbnail_url: null
          })

        getUtxoContentsStub.resolves({ data: []});
        const createUtxoContentsStub = sinon.stub(supabase, 'createUtxoContents')
          .onFirstCall()
          .resolves([{ 
            utxo_id: 1,
            inscription_id: 1,
            rare_sat_range_id: null,
            token_balance_id:  null
          }])
          .onSecondCall()
          .resolves([{ 
            utxo_id: 2,
            inscription_id: 2,
            rare_sat_range_id: null,
            token_balance_id:  null
          }])

        const getRawTransactionStub = sinon.stub(esplora, 'getRawTransaction')
          .onFirstCall()
          .resolves("0100000000010...000")
          .onSecondCall()
          .resolves("0100000000010...001")
        const processedInscriptions = await launchpadListing.proccessInscriptions(inscriptions, makerPaymentAddress, makerOrdinalAddress, makerOrdinalPublicKey);
        expect(processedInscriptions).to.have.lengthOf(2);
        expect(processedInscriptions).to.deep.equal([
          {
            utxoId: 1,
            output: 'txid:0',
            value: 1000,
            address: 'bc1q...',
            makerOrdinalAddressId: 1,
            rawTransaction: '0100000000010...000'
          },
          {
            utxoId: 2,
            output: 'txid:2',
            value: 3000,
            address: 'bc1q...',
            makerOrdinalAddressId: 1,
            rawTransaction: '0100000000010...001'
          }
        ]);
        expect(getInscriptionInfoByIdStub.calledTwice).to.be.true;
        expect(getOrInsertAddressStub.calledTwice).to.be.true;
        expect(createUtxoStub.calledTwice).to.be.true;
        expect(createInscriptionStub.calledTwice).to.be.true;
        expect(getRawTransactionStub.calledTwice).to.be.true;
        expect(createUtxoContentsStub.calledOnce).to.be.true;

        expect(getOrInsertAddressStub.calledWith('bc1q...',makerOrdinalPublicKey)).to.be.true;
        expect(getRawTransactionStub.calledWith('txid')).to.be.true;

        expect(getInscriptionInfoByIdStub.firstCall.args[0]).to.equal('inscription1');
        expect(createUtxoStub.firstCall.args[0]).to.equal('txid:0');
        expect(createInscriptionStub.firstCall.args[0]).to.deep.equal({ inscription_id: 'inscription1' });

        expect(getInscriptionInfoByIdStub.secondCall.args[0]).to.equal('inscription2');
        expect(createUtxoStub.secondCall.args[0]).to.equal('txid:2');
        expect(createInscriptionStub.secondCall.args[0]).to.deep.equal({ inscription_id: 'inscription2' });
        expect(createUtxoContentsStub.calledWith([
          { utxo_id: 1, inscription_id: 1 },
          { utxo_id: 2, inscription_id: 2 }
        ])).to.be.true;
      });

      it('should throw an error if utxo address mismatch', async () => {
        const makerPaymentAddress = '3N6....';
        const makerOrdinalAddress = 'bc1q...';
        const getInscriptionInfoByIdStub = sinon.stub(ordExplorer, 'getInscriptionInfoById')
          .onFirstCall()
          .resolves({
            "address": "bc1q...12",
            "charms": [],
            "children": [],
            "content_length": 4,
            "content_type": "text/plain;charset=utf-8",
            "effective_content_type": "text/plain;charset=utf-8",
            "fee": 139,
            "height": 2572093,
            "id": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340i0",
            "next": "21c930d844ebc3a844ca8463a0d5177a421a0d26311647151c7845a1de585a43i0",
            "number": 767454,
            "parents": [],
            "previous": "8c521217e747f3be95e267860b80ea344935d6679c4498eadce9500d2e2e312ci0",
            "rune": null,
            "sat": 1421505156112849,
            "satpoint": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0:0",
            "timestamp": 1704849671,
            "value": 1000,
            "output": "txid:0",
            "location": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0:0"
          })

        // Call the method and expect it to throw
        await expect(
          launchpadListing.proccessInscriptions(inscriptions, makerPaymentAddress, makerOrdinalAddress, makerOrdinalPublicKey)
        ).to.be.rejectedWith('utxo address mismatch');
        expect(getInscriptionInfoByIdStub.calledOnce).to.be.true;
      });
    });

    describe('createPhaseAllowList()', () => {
      let createPhaseAllowListStub: sinon.SinonStub;

      const phaseId = 1;
      const allowList = [
        { address: 'bc1q...', allocation: 100 },
        { address: 'bc1q123...', allocation: 200 },
      ];

      beforeEach(() => {

        getOrInsertAddressStub
          .onFirstCall()
          .resolves(1)
          .onSecondCall()
          .resolves(2);

        createPhaseAllowListStub = sinon.stub(supabase, 'createPhaseAllowList').resolves([]);
      });


      it('should successfully create phase allow list when valid inputs are provided', async () => {
        await launchpadListing.createPhaseAllowList(phaseId, allowList);

        // Assertions
        expect(getOrInsertAddressStub.calledTwice).to.be.true;
        expect(createPhaseAllowListStub.calledOnce).to.be.true;
        expect(createPhaseAllowListStub.firstCall.args[0]).to.deep.equal([
          {
            phase_id: phaseId,
            taker_ordinal_address_id: 1,
            total_allocation: 100,
            remaining_allocation: 100
          },
          {
            phase_id: phaseId,
            taker_ordinal_address_id: 2,
            total_allocation: 200,
            remaining_allocation: 200
          }
        ]);
      });

      it('should not create phase allow list when the allow list is empty', async () => {
        await launchpadListing.createPhaseAllowList(phaseId, []);
        expect(getOrInsertAddressStub.called).to.be.false;
        expect(createPhaseAllowListStub.called).to.be.false;
      });
    });

    describe('createPhaseInscriptions()', () => {

      let getPlatformFeeAddressStub: sinon.SinonStub;
      let createPsbtBatchStub: sinon.SinonStub;
      let createPsbtStub: sinon.SinonStub;
      let updatePsbtDataByIdStub: sinon.SinonStub;
      let createOrderBooksStub: sinon.SinonStub;
      let updatePsbtBatchByIdStub: sinon.SinonStub;

      let getRawTransactionStub: sinon.SinonStub;
      let marketplaceObj: any;

      const phaseId = 1;
      const price = 1000;
      const makerOrdinalPublicKey = '033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c05';
      const makerPaymentAddress = '2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL';
      const makerPaymentAddressId = 4;
      const inscriptionBatches = [
        [
          {
            utxoId: 1,
            output: 'c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0',
            value: 546,
            makerOrdinalAddressId: 3,
            rawTransaction: '02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000',
            address: 'tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea'
          },
          {
            utxoId: 2,
            output: 'caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3:0',
            value: 546,
            makerOrdinalAddressId: 3,
            rawTransaction: '020000000001015cc436defbf9488ff0e41b12196b83c8f2ed48c7f8379ad9305f069020e93adc0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a03407efdb0fd4f56a2245eff2cd7a4bebd6457f01510d850271243a953be1481d0d99cfdae75a2e673a4f5817f61ff10dbd05f22df6d05cff84456dc593b7bcabdc34a203b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcfac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436366821c03b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcf00000000',
            address: 'tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea'
          },
        ],
      ];
      const marketplace = {
        id: "6e210197-3d24-40da-b6a3-07f7bfdf6d32",
        launchpad_fee_btc_address_id: 1,
        launchpad_maker_fee: 499,
        launchpad_taker_fee: 499,
      };

      beforeEach(() => {
        getPlatformFeeAddressStub = sinon.stub(supabase, 'getPlatformFeeAddress');
        createPsbtBatchStub = sinon.stub(supabase, 'createPsbtBatch');
        createPsbtStub = sinon.stub(supabase, 'createPsbt');
        updatePsbtDataByIdStub = sinon.stub(supabase, 'updatePsbtDataById');
        createOrderBooksStub = sinon.stub(supabase, 'createOrderBooks');
        updatePsbtBatchByIdStub = sinon.stub(supabase, 'updatePsbtBatchById');

        getRawTransactionStub = sinon.stub(esplora, 'getRawTransaction');
        marketplaceObj = marketplace;
      });

      afterEach(() => {
        sinon.restore();
      });

      it('should successfully create phase inscriptions when valid inputs are provided', async () => {
        getPlatformFeeAddressStub.resolves({ id: 2 });
        createPsbtBatchStub.resolves({ id: 3 });
        createPsbtStub.resolves({ id: 4 });
        getRawTransactionStub
          .onCall(0).resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000")
          .onCall(1).resolves("020000000001015cc436defbf9488ff0e41b12196b83c8f2ed48c7f8379ad9305f069020e93adc0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a03407efdb0fd4f56a2245eff2cd7a4bebd6457f01510d850271243a953be1481d0d99cfdae75a2e673a4f5817f61ff10dbd05f22df6d05cff84456dc593b7bcabdc34a203b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcfac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436366821c03b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcf00000000");

        updatePsbtDataByIdStub.resolves({})
        createOrderBooksStub.resolves([{}]);
        updatePsbtBatchByIdStub.resolves([{}])

        await launchpadListing.createPhaseInscriptions(
          phaseId,
          inscriptionBatches,
          price,
          makerOrdinalPublicKey,
          makerPaymentAddress,
          makerPaymentAddressId,
          marketplaceObj
        );

        expect(getPlatformFeeAddressStub.calledOnce).to.be.true;
        expect(createPsbtBatchStub.calledOnce).to.be.true;
        expect(createPsbtBatchStub.calledOnceWithExactly({
          phase_id: phaseId,
          batch_number: 1,
          status: PHASE_BATCH_STATUS.processing,
          inscription_count: 2
        })).to.be.true;
        expect(createPsbtStub.calledOnce).to.be.true;
        expect(createPsbtStub.calledOnceWithExactly({
          batch_id: 3,
          is_signed: false
        })).to.be.true;
        expect(getRawTransactionStub.callCount).to.equals(2);
        expect(updatePsbtDataByIdStub.calledOnce).to.be.true;
        expect(updatePsbtDataByIdStub.calledOnceWithExactly(
          4,
          {
            unsigned_psbt: "cHNidP8BAJwCAAAAAiuzrMzeB0/r94ERUCWOvx8/cqe1FvJU9GlvqQGhXB/JAAAAAAD/////04YFFhbjoOQdTWjWKgxFrvUVrNq0hbDGUF8/uA+t7coAAAAAAP////8CpwUAAAAAAAAXqRSSFX0LpHlje+bnX7u5HqzE+zWxOIenBQAAAAAAABepFJIVfQukeWN75udfu7kerMT7NbE4hwAAAAAAAQErIgIAAAAAAAAiUSAfine0Ac3LjHgSyxNQ7HdRBeuM/vLnL2QP7yjR/bxxegEDBIMAAAAAAQErIgIAAAAAAAAiUSAfine0Ac3LjHgSyxNQ7HdRBeuM/vLnL2QP7yjR/bxxegEDBIMAAAAAAAA="
          }
        )).to.be.true;

        expect(createOrderBooksStub.calledOnce).to.be.true;
        expect(createOrderBooksStub.calledOnceWith(sinon.match.array)).to.be.true;
        expect(updatePsbtBatchByIdStub.calledOnce).to.be.true;
        expect(updatePsbtBatchByIdStub.calledOnceWithExactly(
          3,
          {
            status: PHASE_BATCH_STATUS.unsigned
          }
        )).to.be.true;
      });
    });

    describe('getLaunchpadPhasesInfo', function () {
      let getLaunchpadByIdStub: sinon.SinonStub;
      let getLaunchpadPhaseInfoStub: sinon.SinonStub;
      let launchpadId: number;
      let marketplaceId: string;
      beforeEach(() => {
        getLaunchpadByIdStub = sinon.stub(supabase, "getLaunchpadById");
        getLaunchpadPhaseInfoStub = sinon.stub(supabase, "getLaunchpadPhaseInfo");
        launchpadId = 1;
        marketplaceId = 'marketplace123';
      });

      it('should return launchpad phase info on success', async () => {

        const launchpadData = { id: launchpadId, name: 'Test Launchpad', marketplace_id: marketplaceId };
        const phaseData = [
          {
            "id": 1,
            "launchpad_id": 1,
            "name": "Early bird",
            "phase_number": 1,
            "start_date": 1729621800,
            "end_date": 1729621810,
            "status": "pending",
            "is_public": false,
            "price": 1500,
            "created_at": "2024-11-12 10:00:00.153485",
            "updated_at": "2024-11-13 10:00:00.153485",
            "marketplace_id": "marketplace-id",
            "psbts": [
              {
                "id": 1,
                "status": "unsigned",
                "phase_id": 1,
                "batch_number": 1,
                "inscription_count": 2
              }
            ]
          },
          {
            "id": 2,
            "launchpad_id": 1,
            "name": "Moon chand Era",
            "phase_number": 2,
            "start_date": 1730507265,
            "end_date": 1730593665,
            "status": "pending",
            "is_public": false,
            "price": 2500,
            "created_at": "2024-11-12 10:00:00.153485",
            "updated_at": "2024-11-13 10:00:00.153485",
            "marketplace_id": "marketplace-id",
            "psbts": [
              {
                "id": 2,
                "status": "unsigned",
                "phase_id": 2,
                "batch_number": 1,
                "inscription_count": 2
              }
            ]
          }
        ];

        getLaunchpadByIdStub.resolves({ data: launchpadData, error: null });
        getLaunchpadPhaseInfoStub.resolves({ data: phaseData, error: null });

        const result = await launchpadListing.getLaunchpadPhasesInfo(launchpadId, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('phases');
        expect(getLaunchpadByIdStub.calledOnce).to.be.true;
        expect(getLaunchpadPhaseInfoStub.calledOnce).to.be.true;
        expect(getLaunchpadByIdStub.calledWith(launchpadId)).to.be.true;
        expect(getLaunchpadPhaseInfoStub.calledWith({ 'launchpad_id': launchpadId })).to.be.true;
      });


      it('should return an error if getLaunchpadById fails', async () => {
        // Mock getOrderDetails to return an error
        getLaunchpadByIdStub.resolves({ data: null, error: new Error('launchpad not found') });

        // Assert that the method throws the expected error
        const result = await launchpadListing.getLaunchpadPhasesInfo(launchpadId, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("launchpad not found");
        expect(getLaunchpadByIdStub.calledOnceWithExactly(launchpadId)).to.be.true;
      });

      it('should throw an error if getLaunchpadPhaseInfo fails', async () => {

        const launchpadData = { id: launchpadId, name: 'Test Launchpad', marketplace_id: marketplaceId };
        getLaunchpadByIdStub.resolves({ data: launchpadData, error: null });
        // Mock getOrderDetails to return an error
        getLaunchpadPhaseInfoStub.resolves({ data: null, error: new Error('launchpad phase not found') });

        // Assert that the method throws the expected error
        const result = await launchpadListing.getLaunchpadPhasesInfo(launchpadId, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("launchpad phase not found");
        expect(getLaunchpadByIdStub.calledOnceWithExactly(launchpadId)).to.be.true;

        expect(getLaunchpadPhaseInfoStub.calledOnceWithExactly(
          { 'launchpad_id': launchpadId }
        )).to.be.true;
      });
      
      it('should throw an error if marketplace id isnot matched', async () => {

        const launchpadData = { id: launchpadId, name: 'Test Launchpad', marketplace_id: 'other-marketplace-id' };
        getLaunchpadByIdStub.resolves({ data: launchpadData, error: null });
        // Mock getOrderDetails to return an error
        getLaunchpadPhaseInfoStub.resolves({ data: null, error: new Error('launchpad phase not found') });

        // Assert that the method throws the expected error
        const result = await launchpadListing.getLaunchpadPhasesInfo(launchpadId, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("invalid marketplace id");
        expect(getLaunchpadByIdStub.calledOnceWithExactly(
          launchpadId
        )).to.be.true;
      });
    });

    describe('getLaunchpadPsbtStatus', function () {
      let getBatchByIdStub: sinon.SinonStub;
      let batchId: number;
      let marketplaceId: string;

      beforeEach(() => {
        getBatchByIdStub = sinon.stub(supabase, "getBatchById");
        batchId = 1;
        marketplaceId = 'marketplace123';
      });

      it('should return psbt data when valid marketplace id and psbt_data exist', async () => {
        const batchData = {
          data: {
            id: batchId,
            phases: { launchpad: { marketplace_id: marketplaceId } },
            psbts: [{ unsigned_psbt: 'psbt_data_example' }],
            other_data: 'other_data',
          },
          error: null,
        };

        getBatchByIdStub.resolves(batchData);

        const result = await launchpadListing.getLaunchpadPsbtStatus(batchId, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.have.property('psbt', 'psbt_data_example');
        expect(result).to.have.property('other_data', 'other_data');
        expect(getBatchByIdStub.calledOnce).to.be.true;
        expect(getBatchByIdStub.calledWith(batchId)).to.be.true;
      });

      it('should throw an error if getBatchById fails', async () => {
        getBatchByIdStub.resolves({ data: null, error: new Error('batch not found') });
        const result = await launchpadListing.getLaunchpadPsbtStatus(batchId, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("batch not found");
        expect(getBatchByIdStub.calledOnceWithExactly(batchId)).to.be.true;
      });

      it('should throw an error if marketplace_id does not match', async () => {
        const batchData = {
          data: {
            id: batchId,
            phases: { launchpad: { marketplace_id: 'other_marketplace' } },
            psbts: [{ unsigned_psbt: 'psbt_data_example' }],
            other_data: 'other_data',
          },
          error: null,
        };

        getBatchByIdStub.resolves(batchData);

        const result = await launchpadListing.getLaunchpadPsbtStatus(batchId, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("invalid marketplace id");

        expect(getBatchByIdStub.calledOnceWithExactly(batchId)).to.be.true;
      });

      it('should throw an error if psbt_data is not available', async () => {
        const batchData = {
          data: {
            id: batchId,
            phases: { launchpad: { marketplace_id: marketplaceId } },
            psbts: [{}], // Empty PSBT data
            other_data: 'other_data',
          },
          error: null,
        };

        getBatchByIdStub.resolves(batchData);

        const result = await launchpadListing.getLaunchpadPsbtStatus(batchId, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("psbt is not ready yet!");
        expect(getBatchByIdStub.calledOnceWithExactly(batchId)).to.be.true;
      });
    });

    describe('updateSignedPSBT', function () {
      let getBatchByIdStub: sinon.SinonStub;
      let updatePsbtByBatchIdStub: sinon.SinonStub;
      let updateOrderbookByQueryFilterStub: sinon.SinonStub;
      let updatePsbtBatchByIdStub: sinon.SinonStub;
      let getPhaseUnSignedBatchesCountStub: sinon.SinonStub;
      let updateLaunchpadPhaseByIdStub: sinon.SinonStub;
      let getLaunchpadPhaseInfoStub: sinon.SinonStub;
      let getUtxosByLaunchpadIdStub: sinon.SinonStub;
      let addInputToMonitorStub: sinon.SinonStub;
      let request = {
        id: 1,
        marketplaceId: 'some-uuid',
        signedPSBT: 'some-signed'
      };

      beforeEach(() => {
        getBatchByIdStub = sinon.stub(supabase, "getBatchById");
        updatePsbtByBatchIdStub = sinon.stub(supabase, "updatePsbtByBatchId");
        updateOrderbookByQueryFilterStub = sinon.stub(supabase, "updateOrderbookByQueryFilter");
        updatePsbtBatchByIdStub = sinon.stub(supabase, "updatePsbtBatchById");
        getPhaseUnSignedBatchesCountStub = sinon.stub(supabase, "getPhaseUnSignedBatchesCount");
        updateLaunchpadPhaseByIdStub = sinon.stub(supabase, "updateLaunchpadPhaseById");
        getLaunchpadPhaseInfoStub = sinon.stub(supabase, "getLaunchpadPhaseInfo");
        getUtxosByLaunchpadIdStub = sinon.stub(supabase, "getUtxosByLaunchpadId");
        addInputToMonitorStub = sinon.stub(transactionListener, 'addInputToMonitor');
      });

      it('should successfully update the signed PSBT when valid inputs are provided', async () => {
        const batchData = {
          data: {
            id: request.id,
            phases: { launchpad: { id: 150, marketplace_id: request.marketplaceId } },
            psbts: [{ unsigned_psbt: 'psbt_data_example' }],
            status: PHASE_BATCH_STATUS.unsigned,
            phase_id: 1
          },
          error: null
        };

        getBatchByIdStub.resolves(batchData);
        updatePsbtByBatchIdStub.resolves({ error: null });

        updateOrderbookByQueryFilterStub.resolves({ error: null });
        updatePsbtBatchByIdStub.resolves({ error: null });

        getPhaseUnSignedBatchesCountStub.resolves({ count: 0, error: null });
        updateLaunchpadPhaseByIdStub.resolves({ error: null });

        getLaunchpadPhaseInfoStub.resolves({ count: 0, error: null });
        updateLaunchpadByIdStub.resolves({ error: null });
        getUtxosByLaunchpadIdStub.resolves({ data: [
          {
            id: 10,
            utxo: "utxo:10",
            is_spent: false,
          },
          {
            id: 11,
            utxo: "utxo:11",
            is_spent: false,
          },
          {
            id: 12,
            utxo: "utxo:12",
            is_spent: false,
          }
        ], error: null });

        addInputToMonitorStub.resolves(true);
        const result = await launchpadListing.updateSignedPSBT(request.id, request.marketplaceId, request.signedPSBT);

        expect(result).to.have.property('message', 'Signed PSBT is updated successfully');
        expect(getBatchByIdStub.calledOnceWith(request.id)).to.be.true;

        expect(updatePsbtByBatchIdStub.calledOnceWithExactly(
          request.id,
          {
            signed_psbt: request.signedPSBT,
            is_signed: true
          }
        )).to.be.true;

        expect(updateOrderbookByQueryFilterStub.calledOnceWithExactly(
          { 'batch_id': request.id },
          { status: LAUNCHPAD_STATUS.active }
        )).to.be.true;

        expect(updatePsbtBatchByIdStub.calledOnceWithExactly(
          request.id,
          { status: PHASE_BATCH_STATUS.signed }
        )).to.be.true;

        expect(getPhaseUnSignedBatchesCountStub.calledOnceWithExactly(1)).to.be.true;
        expect(updateLaunchpadPhaseByIdStub.calledOnce).to.be.true;
        expect(getLaunchpadPhaseInfoStub.calledOnce).to.be.true;
        expect(updateLaunchpadByIdStub.calledOnce).to.be.true;
        expect(getUtxosByLaunchpadIdStub.calledOnceWithExactly(150)).to.be.true;
        expect(addInputToMonitorStub.calledThrice).to.be.true;
      });

      it('should throw an error if getBatchById fails', async () => {
        getBatchByIdStub.resolves({ data: null, error: new Error('batch not found') });

        const result = await launchpadListing.updateSignedPSBT(request.id, request.marketplaceId, request.signedPSBT);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("batch not found");
        expect(getBatchByIdStub.calledOnceWithExactly(request.id)).to.be.true;
      });


      it('should throw an error if marketplace_id is invalid', async () => {
        const batchData = {
          data: {
            id: request.id,
            phases: { launchpad: { marketplace_id: 'other_marketplace' } },
            psbts: [{ unsigned_psbt: 'psbt_data_example' }],
            status: PHASE_BATCH_STATUS.unsigned,
            phase_id: 1
          },
          error: null
        };

        getBatchByIdStub.resolves(batchData);

        const result = await launchpadListing.updateSignedPSBT(request.id, request.marketplaceId, request.signedPSBT);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("invalid marketplace id");
        expect(getBatchByIdStub.calledOnceWithExactly(request.id)).to.be.true;
      });

      it('should throw an error if psbt_data is not ready', async () => {
        const batchData = {
          data: {
            id: request.id,
            phases: { launchpad: { marketplace_id: request.marketplaceId } },
            psbts: [{}], // Empty PSBT data
            status: PHASE_BATCH_STATUS.unsigned,
            phase_id: 1
          },
          error: null
        };

        getBatchByIdStub.resolves(batchData);
        const result = await launchpadListing.updateSignedPSBT(request.id, request.marketplaceId, request.signedPSBT);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("psbt is not ready yet!");
        expect(getBatchByIdStub.calledOnceWithExactly(request.id)).to.be.true;
      });

      it('should throw an error if psbt is already signed', async () => {
        const batchData = {
          data: {
            id: request.id,
            phases: { launchpad: { marketplace_id: request.marketplaceId } },
            psbts: [{ unsigned_psbt: 'psbt_data_example' }],
            status: PHASE_BATCH_STATUS.signed,
            phase_id: 1
          },
          error: null
        };

        getBatchByIdStub.resolves(batchData);

        const result = await launchpadListing.updateSignedPSBT(request.id, request.marketplaceId, request.signedPSBT);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("psbt already signed!");

        expect(getBatchByIdStub.calledOnceWithExactly(request.id)).to.be.true;
      });
    });

    describe('getAllocations', function () {
      let getLaunchpadByIdStub: sinon.SinonStub;
      let getLaunchpadPhaseInfoStub: sinon.SinonStub;
      let getAllocationsStub: sinon.SinonStub;
      let id: number;
      let marketplaceId: string;
      let takerOrdinalAddress: string;

      beforeEach(() => {
        getLaunchpadByIdStub = sinon.stub(supabase, "getLaunchpadById");
        getLaunchpadPhaseInfoStub = sinon.stub(supabase, "getLaunchpadPhaseInfo");
        getAllocationsStub = sinon.stub(supabase, "getAllocations");

        id = 1;
        marketplaceId = "marketplace123-uuid";
        takerOrdinalAddress = "taker_address_example";
      });

      it('should successfully return allocations when valid inputs are provided', async () => {
        const launchpadData = { data: { 'marketplace_id': marketplaceId }, error: null };
        const phasesData = { data: [{ id: 1 }, { id: 2 }], error: null };
        const allowedPhasesData = { data: [{ phase_id: 1, total_allocation: 100, remaining_allocation: 50 }, { phase_id: 2, total_allocation: 200, remaining_allocation: 100 }], error: null };

        getLaunchpadByIdStub.resolves(launchpadData);
        getOrInsertAddressStub.resolves(123);
        getLaunchpadPhaseInfoStub.resolves(phasesData);
        getAllocationsStub.resolves(allowedPhasesData);

        const result = await launchpadListing.getAllocations(id, marketplaceId, takerOrdinalAddress);

        expect(result).to.have.property('phases').that.is.an('array').with.lengthOf(2);
        // Check the first phase if it exists
        if (result.phases && result.phases[0]) {
          expect(result.phases[0]).to.include({ id: 1 });
          expect(result.phases[0]).to.have.property('total_allocation', 100);
          expect(result.phases[0]).to.have.property('remaining_allocation', 50);
        }
        expect(getLaunchpadByIdStub.calledOnce).to.be.true;
        expect(getOrInsertAddressStub.calledOnce).to.be.true;
        expect(getOrInsertAddressStub.calledOnceWithExactly("taker_address_example")).to.be.true;
        expect(getLaunchpadPhaseInfoStub.calledOnce).to.be.true;
        expect(getAllocationsStub.calledOnce).to.be.true;
      });

      it('should return an error if launchpad is not found', async () => {
        getLaunchpadByIdStub.resolves({ error: new Error('launchpad not found') });

        const result = await launchpadListing.getAllocations(id, marketplaceId, takerOrdinalAddress);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("launchpad not found");
        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
      });

      it('should return an error if phases are not found', async () => {
        const launchpadData = { data: { 'marketplace_id': marketplaceId }, error: null };
        getLaunchpadByIdStub.resolves(launchpadData);
        getOrInsertAddressStub.resolves(123);
        getLaunchpadPhaseInfoStub.resolves({ data: null, error: new Error('phases not found') });

        const result = await launchpadListing.getAllocations(id, marketplaceId, takerOrdinalAddress);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("phases not found");

        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
        expect(getOrInsertAddressStub.calledOnceWithExactly("taker_address_example")).to.be.true;
        expect(getLaunchpadPhaseInfoStub.calledOnce).to.be.true;
      });

      it('should return an error if allocations are not found', async () => {
        const launchpadData = { data: { 'marketplace_id': marketplaceId }, error: null };
        const phasesData = { data: [{ id: 1 }, { id: 2 }], error: null };
        getLaunchpadByIdStub.resolves(launchpadData);
        getOrInsertAddressStub.resolves(123);
        getLaunchpadPhaseInfoStub.resolves(phasesData);
        getAllocationsStub.resolves({ error: new Error('allow lists not found') });

        const result = await launchpadListing.getAllocations(id, marketplaceId, takerOrdinalAddress);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("allow lists not found");
        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
        expect(getOrInsertAddressStub.calledOnce).to.be.true;
        expect(getLaunchpadPhaseInfoStub.calledOnce).to.be.true;
        expect(getAllocationsStub.calledOnce).to.be.true;
      });

      it('should return an empty array if no allocations are found for a phase', async () => {
        const launchpadData = { data: { 'marketplace_id': marketplaceId }, error: null };
        const phasesData = { data: [{ id: 1 }, { id: 2 }], error: null };
        const allowedPhasesData = { data: [], error: null };

        getLaunchpadByIdStub.resolves(launchpadData);
        getOrInsertAddressStub.resolves(id);
        getLaunchpadPhaseInfoStub.resolves(phasesData);
        getAllocationsStub.resolves(allowedPhasesData);

        const result = await launchpadListing.getAllocations(id, marketplaceId, takerOrdinalAddress);

        expect(result).to.have.property('phases').that.is.an('array').with.lengthOf(0);
        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
        expect(getOrInsertAddressStub.calledOnceWithExactly("taker_address_example")).to.be.true;
        expect(getLaunchpadPhaseInfoStub.calledOnce).to.be.true;
        expect(getAllocationsStub.calledOnce).to.be.true;
      });

      it('should throw an error if getLaunchpadPhaseInfo fails', async () => {
        const launchpadData = { data: { 'marketplace_id': marketplaceId }, error: null };
        getLaunchpadByIdStub.resolves(launchpadData);
        getOrInsertAddressStub.resolves(123);
        getLaunchpadPhaseInfoStub.resolves({ error: new Error('phases not found') });
        
        const result = await launchpadListing.getAllocations(id, marketplaceId, takerOrdinalAddress);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("phases not found");

        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
        expect(getOrInsertAddressStub.calledOnceWithExactly("taker_address_example")).to.be.true;
        expect(getLaunchpadPhaseInfoStub.calledOnce).to.be.true;
      });
      
      it('should throw an return marketplace id missmatch', async () => {
        const launchpadData = { data: { 'marketplace_id': 'other-marketplace-id' }, error: null };
        getLaunchpadByIdStub.resolves(launchpadData);
        const result = await launchpadListing.getAllocations(id, marketplaceId, takerOrdinalAddress);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("invalid marketplace id");
        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
      });
    });

    describe('createTakerPSBT', function () {
      let getLaunchpadByIdStub: sinon.SinonStub;
      let getLaunchpadActivePhasesStub: sinon.SinonStub;
      let checkAndDecreasePhaseAllocationStub: sinon.SinonStub;
      let getOrderDetailStub: sinon.SinonStub;
      let prepareTakerPSBTStub: sinon.SinonStub;
      let increaseAllocationsStub: sinon.SinonStub;
      let id: number;
      let takerPaymentAddress: string;
      let takerPaymentPublicKey: string;
      let takerOrdinalAddress: string;
      let marketplaceId: string;
      let feeRate: number;

      beforeEach(() => {
        getLaunchpadByIdStub = sinon.stub(supabase, "getLaunchpadById");
        getLaunchpadActivePhasesStub = sinon.stub(supabase, "getLaunchpadActivePhases");
        checkAndDecreasePhaseAllocationStub = sinon.stub(supabase, "checkAndDecreasePhaseAllocation");
        getOrderDetailStub = sinon.stub(supabase, "getOrderDetail");
        prepareTakerPSBTStub = sinon.stub(launchpadListing, "prepareTakerPSBT");
        increaseAllocationsStub = sinon.stub(supabase, "increaseAllocations");
        id = 1;
        takerPaymentAddress = "taker_payment_address";
        takerPaymentPublicKey = "taker_payment_public_key";
        takerOrdinalAddress = "taker_ordinal_address";
        marketplaceId = "marketplace123";
        feeRate = 10;
      });

      it('should successfully create a taker PSBT when valid inputs are provided', async () => {
        const launchpadData = { data: { status: LAUNCHPAD_STATUS.active, marketplace_id: marketplaceId, remaining_inscriptions: 10 }, error: null };
        const phasesData = { data: [{ id: 1 }], count: 1, error: null };
        const takerAllowListData = { data: { status: true, error: null }, error: null };
        const orderbookData = { data: { orderbookId: 1, batch_id: 123, psbt: "signed_psbt" }, error: null };

        getLaunchpadByIdStub.resolves(launchpadData);
        getLaunchpadActivePhasesStub.resolves(phasesData);
        getOrInsertAddressStub.resolves(123);
        checkAndDecreasePhaseAllocationStub.resolves(takerAllowListData);
        getOrderDetailStub.resolves(orderbookData);
        prepareTakerPSBTStub.resolves({ orderIds: [1], batchIds: [123], psbt: "signed_psbt", inputIndices: [0, 1] });

        const result = await launchpadListing.createTakerPSBT(id, takerPaymentAddress, takerPaymentPublicKey, takerOrdinalAddress, marketplaceId, feeRate);

        expect(result).to.have.property('id', 1);
        expect(result).to.have.property('batchId', 123);
        expect(result).to.have.property('psbt', "signed_psbt");
        expect(result).to.have.property('inputIndices').that.is.an('array').with.lengthOf(2);
        expect(getLaunchpadByIdStub.calledOnce).to.be.true;
        expect(getLaunchpadActivePhasesStub.calledOnce).to.be.true;
        expect(getOrInsertAddressStub.calledOnce).to.be.true;
        expect(checkAndDecreasePhaseAllocationStub.calledOnce).to.be.true;
        expect(getOrderDetailStub.calledOnce).to.be.true;
        expect(prepareTakerPSBTStub.calledOnce).to.be.true;
        expect(increaseAllocationsStub.notCalled).to.be.true;
      });
      
      it('should return an error if all inscriptions are sold in the launchpad', async () => {
        const launchpadData = { data: { status: LAUNCHPAD_STATUS.active, marketplace_id: marketplaceId, remaining_inscriptions: 0 }, error: null };

        getLaunchpadByIdStub.resolves(launchpadData);

        const result = await launchpadListing.createTakerPSBT(id, takerPaymentAddress, takerPaymentPublicKey, takerOrdinalAddress, marketplaceId, feeRate);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("all inscriptions have been minted");
        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
        expect(increaseAllocationsStub.notCalled).to.be.true;
      });

      it('should return an error if launchpad is not found', async () => {
        getLaunchpadByIdStub.resolves({ error: new Error('launchpad not found') });

        const result = await launchpadListing.createTakerPSBT(id, takerPaymentAddress, takerPaymentPublicKey, takerOrdinalAddress, marketplaceId, feeRate);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("launchpad not found");
        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
        expect(increaseAllocationsStub.notCalled).to.be.true;
      });

      it('should return an error if the launchpad is not active', async () => {
        const launchpadData = { data: { status: LAUNCHPAD_STATUS.initializing, marketplace_id: marketplaceId }, error: null };
        getLaunchpadByIdStub.resolves(launchpadData);

        const result = await launchpadListing.createTakerPSBT(id, takerPaymentAddress, takerPaymentPublicKey, takerOrdinalAddress, marketplaceId, feeRate);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("launchpad not active");
        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
        expect(increaseAllocationsStub.notCalled).to.be.true;
      });
      
      it('should return an error if the invalid marketplace id', async () => {
        const launchpadData = { data: { status: LAUNCHPAD_STATUS.active, marketplace_id: 'other-marketplace-id' }, error: null };
        getLaunchpadByIdStub.resolves(launchpadData);

        const result = await launchpadListing.createTakerPSBT(id, takerPaymentAddress, takerPaymentPublicKey, takerOrdinalAddress, marketplaceId, feeRate);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("invalid marketplace id");
        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
        expect(increaseAllocationsStub.notCalled).to.be.true;
      });

      it('should throw an error if no active phases are found', async () => {
        const launchpadData = { data: { status: LAUNCHPAD_STATUS.active, marketplace_id: marketplaceId }, error: null };
        const phasesData = { data: [], count: 0, error: null };

        getLaunchpadByIdStub.resolves(launchpadData);
        getLaunchpadActivePhasesStub.resolves(phasesData);

        const result = await launchpadListing.createTakerPSBT(id, takerPaymentAddress, takerPaymentPublicKey, takerOrdinalAddress, marketplaceId, feeRate);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error');
        expect(result.error).to.deep.equal("no active phase found!");
        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
        expect(getLaunchpadActivePhasesStub.calledOnce).to.be.true;
        expect(increaseAllocationsStub.notCalled).to.be.true;
      });

      it('should throw an error if phase allocation is not available', async () => {
        const launchpadData = { data: { status: LAUNCHPAD_STATUS.active, marketplace_id: marketplaceId }, error: null };
        const phasesData = { data: [{ id: 1 }], count: 1, error: null };
        const takerAllowListData = { data: { status: false, error: 'MINTING_LOCKED' }, error: null };

        getLaunchpadByIdStub.resolves(launchpadData);
        getLaunchpadActivePhasesStub.resolves(phasesData);
        getOrInsertAddressStub.resolves(123);
        checkAndDecreasePhaseAllocationStub.resolves(takerAllowListData);

        await expect(launchpadListing.createTakerPSBT(id, takerPaymentAddress, takerPaymentPublicKey, takerOrdinalAddress, marketplaceId, feeRate))
          .to.be.rejectedWith('You either have no remaining allocations or you are currently locked from minting, please try again in a few minute');
        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
        expect(getLaunchpadActivePhasesStub.calledOnce).to.be.true;
        expect(getOrInsertAddressStub.calledOnce).to.be.true;
        expect(checkAndDecreasePhaseAllocationStub.calledOnce).to.be.true;
        expect(increaseAllocationsStub.notCalled).to.be.true;
      });

      it('should throw an error if orderbook is not found', async () => {
        const launchpadData = { data: { status: LAUNCHPAD_STATUS.active, marketplace_id: marketplaceId }, error: null };
        const phasesData = { data: [{ id: 1 }], count: 1, error: null };
        const takerAllowListData = { data: { status: true, error: null }, error: null };
        const orderbookData = { error: new Error('listing not found') };

        getLaunchpadByIdStub.resolves(launchpadData);
        getLaunchpadActivePhasesStub.resolves(phasesData);
        getOrInsertAddressStub.resolves(123);
        checkAndDecreasePhaseAllocationStub.resolves(takerAllowListData);
        getOrderDetailStub.resolves(orderbookData);
        increaseAllocationsStub.resolves({ data: {}, error: null });
        await expect(launchpadListing.createTakerPSBT(id, takerPaymentAddress, takerPaymentPublicKey, takerOrdinalAddress, marketplaceId, feeRate))
          .to.be.rejectedWith('listing not found');
        expect(getLaunchpadByIdStub.calledOnceWithExactly(id)).to.be.true;
        expect(getLaunchpadActivePhasesStub.calledOnce).to.be.true;
        expect(getOrInsertAddressStub.calledOnce).to.be.true;
        expect(checkAndDecreasePhaseAllocationStub.calledOnce).to.be.true;
        expect(getOrderDetailStub.calledOnce).to.be.true;
        expect(increaseAllocationsStub.calledOnceWithExactly(1, 123)).to.be.true;
      });
    });

    describe('mergeSignedPSBT', function () {
      let getOrderDetailStub: sinon.SinonStub;
      let broadCastPSBTStub: sinon.SinonStub;
      let id: number;
      let signedPSBT: string;
      let marketplaceId: string;
      const txHex = '02000000000104b5986939b763e9f894f95acb963665d7e2cc8622fdf05cd81377e33a52dddf820400000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffb5986939b763e9f894f95acb963665d7e2cc8622fdf05cd81377e33a52dddf820500000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff11304655962e470089f51afc16e402c7949d16fe735cacf1203f8944dbb511da0100000000fffffffff7184f6751cb0cf56b932f240af163dae9395946b6d23f60c97f6b987ddb83430100000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff07b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f872202000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cbcc0600000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887e80300000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87cd1e00000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f870247304402207ea50715faabfa93494e235d2e6a2cd381ac226186679435c15142e283ccc761022065ab6f8b8264753bf655b9eb84db547c096178897d95db4ab9d6886d94136c57012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf37024730440220793dadbddf24462da205f88ad8a200961ed7ea27939bdea9bfcd2527e7bc5e1b02200673b6d9dbadd79e50f46159d653d9d18273053bdd332ceeb137b4376acefda8012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370141627fbc1099cc410b6728cf788ceb140fa402e72a588ee01afc3e9cb1deefc8e7d64ef8110a06826710d698f91e8386b0eb14dfa78b90d39d309f50431ba42909830247304402201909fadc6f334a84bf5cce0eb5f6f06d937e154440d844f6f62ae7b0e674cbe8022055ac117c15a626f55f7f2c649e2dd9431b3b702d6458e4fd9c43aa3150607850012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000';
      beforeEach(() => {
        getOrderDetailStub = sinon.stub(supabase, "getOrderDetail");
        broadCastPSBTStub = sinon.stub(launchpadListing, "broadCastPSBT");
        id = 1;
        signedPSBT = "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";
        marketplaceId = "marketplace123-uuid";
      });
    
      it('should successfully merge PSBT and broadcast it when valid inputs are provided', async () => {
        const orderbookData = { 
          error: null, 
          data: { 
            psbt: { signed_psbt: "cHNidP8BAFMCAAAAAREwRlWWLkcAifUa/BbkAseUnRb+c1ys8SA/iUTbtRHaAQAAAAD/////AYpNAAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HAAAAAAABASsQJwAAAAAAACJRIPF+pE5+4fgDJyFvmtznshD3xhZ2+p7gp95auV9HqrnLAQMEgwAAAAETQWJ/vBCZzEELZyjPeIzrFA+kAucqWI7gGvw+nLHe78jn1k74EQoGgmcQ1pj5HoOGsOsU36eLkNOdMJ9QQxukKQmDARcgWUpKr12lsUTQ+mtHmH2WYCnYkvvErrsjIUhT6LBTcC4AAA==" },
            utxos: {
              utxo: "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1"
            },
            phase: { id: 1, launchpad: { id: 1 } }, 
            trade_history: [{ transaction_id: 1, status: TRADE_HISTORY_STATUS.initiated }],
            status: 'active',
          }
        };
        getOrderDetailStub.resolves(orderbookData);
        broadCastPSBTStub.resolves({ txId: 'acbf10020f7d540783ca3b5e8dac333065c17d5c8d28fbf0c73c0367b29dc082' });

        const result = await launchpadListing.mergeSignedPSBT(id, signedPSBT, marketplaceId);
        
        expect(broadCastPSBTStub.calledOnceWithExactly(txHex, [orderbookData.data], ORDERBOOK_STATUS.broadcast, ORDERBOOK_TYPE.launchpad)).to.be.true;
        expect(result).to.deep.equal({ txId: 'acbf10020f7d540783ca3b5e8dac333065c17d5c8d28fbf0c73c0367b29dc082' });
        expect(getOrderDetailStub.calledOnce).to.be.true;
      });

      it('should throw an error when the orderbook is not found', async () => {
        const orderbookData = { error: 'listing not found', data: null };
        
        getOrderDetailStub.resolves(orderbookData);
        
        const result = await launchpadListing.mergeSignedPSBT(id, signedPSBT, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error').that.equals("listing not found");
        expect(getOrderDetailStub.calledOnce).to.be.true;
      });

      it('should throw an error when utxos are not found', async () => {
        const orderbookData = { 
          error: null, 
          data: { 
            utxos: null, 
            phase: { id: 1, launchpad: { id: 1 } }, 
            utxo_id: 123, 
            trade_history: [{ transaction_id: 1 }],
            status: 'active',
          }
        };
      
        getOrderDetailStub.resolves(orderbookData);
        
        const result = await launchpadListing.mergeSignedPSBT(id, signedPSBT, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error').that.equals("utxo not found!");
        expect(getOrderDetailStub.calledOnce).to.be.true;
      });

      it('should throw an error when phase is not found', async () => {
        const orderbookData = { 
          error: null, 
          data: { 
            utxos: { utxo: "utxo_example" }, 
            phase: null, 
            utxo_id: 123, 
            trade_history: [{ transaction_id: 1 }],
            status: 'active'
          }
        };
      
        getOrderDetailStub.resolves(orderbookData);
        
        const result = await launchpadListing.mergeSignedPSBT(id, signedPSBT, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error').that.equals("phase not found!");
        
        expect(getOrderDetailStub.calledOnce).to.be.true;
      });

      it('should throw an error when trade history is missing or empty', async () => {
        const orderbookData = { 
          error: null, 
          data: { 
            utxos: { utxo: "utxo_example" }, 
            phase: { id: 1, launchpad: { id: 1 } }, 
            utxo_id: 123, 
            trade_history: [],
            status: 'active' 
          }
        };
        
        getOrderDetailStub.resolves(orderbookData);
        const result = await launchpadListing.mergeSignedPSBT(id, signedPSBT, marketplaceId);
        expect(result).to.be.an('object');
        expect(result).to.be.an('object').that.has.property('error').that.equals("trade history is missing");
        
        expect(getOrderDetailStub.calledOnce).to.be.true;
      });
    });
  });
});