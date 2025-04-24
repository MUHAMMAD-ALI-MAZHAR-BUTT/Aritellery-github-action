import { assert, expect } from 'chai';
import sinon from 'sinon';
import EditionsLaunchpad from '../model/editionsLaunchpad';
import Supabase from '../model/supabase';
import BackendApi from '../api/backendApi';
import DataImporter from '../model/data/importer';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../database.types';
import { CollectionMeta, CollectionData } from '../model/data/types';
import OrdExplorer from '../api/ordExplorer';
import ECPairFactory from 'ecpair';
import * as bitcoinjs from 'bitcoinjs-lib';
import * as bitcoinMessage from 'bitcoinjs-message';
import * as ecc from 'tiny-secp256k1';
import { Signer } from 'bip322-js';
import Slack from '../api/slack';

const ECPair = ECPairFactory(ecc);


describe('EditionsLaunchpad', () => {
    let editionsLaunchpad: EditionsLaunchpad;
    let supabase: Supabase;
    let backendApi: BackendApi;
    let dataImporter: DataImporter;
    let ordExplorerApi: OrdExplorer;
    let slack: Slack;

    const callbackWebhookUrl = 'http://mock.com/callback';
    const launchpadAdditionalFee = 1000;

    let notifySlackStub = sinon.stub();

    beforeEach(() => {
        supabase = new Supabase({ supabase:{} as SupabaseClient<Database>, platformFeeAddress: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' });
        backendApi = new BackendApi('http://mock.com');
        dataImporter = new DataImporter({ supabase: supabase });
        ordExplorerApi = new OrdExplorer('http://mock.com');
        slack = new Slack('http://mock', 'mock');

        editionsLaunchpad = new EditionsLaunchpad({
            supabase: supabase,
            backendApi: backendApi,
            dataImporter: dataImporter,
            additionalFee: launchpadAdditionalFee,
            callbackWebhookUrl: callbackWebhookUrl,
            ordExplorerApi: ordExplorerApi,
            slack: slack,
        });

        notifySlackStub = sinon.stub(slack, 'notifySlack').resolves();
    });

    afterEach(() => {
        sinon.restore();
        sinon.reset();
    });

    describe('#createLaunchpad()', () => {
        const price = 0;
        const slug = 'test-collection'; 
        const numberOfEditions = 10;
        const editionInscriptionId = '31595888de42b27ab700dac1fb1d7ec8d1659337de6287ec0f052c1efb3107f8i0';
        const makerPaymentAddress = '';
        const metaData = {};
        const collectionMeta = {
            name: 'Test Collection',
            description: 'Test Collection Description',
            symbol: 'TST',
            image: 'http://mock.com/image.png',
            editionSize: 10,
            creator: '0x1234567890',
            slug: 'test-collection',
        } as CollectionMeta;
        const createdCollectionId = 1;
        const createdLaunchpadId = 1;

        const inscriptionInfoResponse = {
          charms: ["charm1", "charm2"],
          children: ["child1", "child2"],
          content_length: 1024,
          content_type: "image/png",
          effective_content_type: "image/png",
          fee: 500,
          height: 650000,
          id: "38165c2a5a2b573196d079acbccccc3723534da4271f4be49f78e9d7ef4d5dd6i486",
          next: null,
          number: 123456,
          parents: ["parent1", "parent2"],
          previous: null,
          rune: "rune1",
          sat: 100000000,
          satpoint: "38165c2a5a2b573196d079acbccccc3723534da4271f4be49f78e9d7ef4d5dd6:0",
          timestamp: 1622547800,
          value: 546,
          output: '',
          location: '',
        };

        let signature = '';
        let segwitAddress = '';

        let onboardCollectionStub: sinon.SinonStub;
        let createEditionsLaunchpadStub: sinon.SinonStub;
        let getLaunchpadBySlugStub: sinon.SinonStub;
        let getInscriptionInfoByIdStub: sinon.SinonStub;

        beforeEach(() => {
            const keyPair = ECPair.fromWIF('L4rK1yDtCWekvXuE6oXD9jCYfFNV2cWRpVuPLBcCU2z8TrisoyY1');
            const privateKey = keyPair.privateKey as Buffer;
            const a = bitcoinjs.payments.p2wpkh({ pubkey: Buffer.from(keyPair.publicKey) });
            const address = a.address as string;
            const timestamp = Math.floor(Date.now() / 1000);
            const messageToSign = `${editionInscriptionId}:${timestamp}`;
    
            const sigBuff = bitcoinMessage.sign(messageToSign, privateKey, keyPair.compressed, { segwitType: 'p2wpkh' })
            const sigString = sigBuff.toString('base64');

            segwitAddress = address;

            signature = `${editionInscriptionId}:${timestamp}:${address}:${sigString}`;

            onboardCollectionStub = sinon.stub(dataImporter, 'onboardCollection').resolves({ success: true, id: createdCollectionId, error: null });
            createEditionsLaunchpadStub = sinon.stub(supabase, 'createEditionsLaunchpad').resolves(createdLaunchpadId);
            getLaunchpadBySlugStub = sinon.stub(supabase, 'getLaunchpadBySlug').resolves(null);
            getInscriptionInfoByIdStub = sinon.stub(ordExplorerApi, 'getInscriptionInfoById');
        });

        it('should create a launchpad', async () => {
            getInscriptionInfoByIdStub.resolves({
              ...inscriptionInfoResponse,
              address: segwitAddress,
            });

            const res = await editionsLaunchpad.createLaunchpad(price, signature, slug, numberOfEditions, editionInscriptionId, makerPaymentAddress, metaData, collectionMeta);

            expect(res).to.deep.equal({ id: createdLaunchpadId, slug, numberOfEditions });
            expect(onboardCollectionStub.calledOnceWith(collectionMeta, [], false)).to.be.true;
            expect(createEditionsLaunchpadStub.calledOnceWith(price, slug, numberOfEditions, editionInscriptionId, makerPaymentAddress, createdCollectionId, metaData)).to.be.true;
            expect(getInscriptionInfoByIdStub.calledOnceWith(editionInscriptionId)).to.be.true;
            expect(notifySlackStub.getCall(0).args).to.deep.equal(['Editions launchpad created with ID: 1 and slug: test-collection by bc1qngw83fg8dz0k749cg7k3emc7v98wy0c74dlrkd']);
        });

        it('should not create a launchpad with invalid signature', async () => {
          const invalidSignature = `${editionInscriptionId}:1231231123:bc1qngw83fg8dz0k749cg7k3emc7v98wy0c74dlrkd:{invalid-sig}`;
          const res = await editionsLaunchpad.createLaunchpad(price, invalidSignature, slug, numberOfEditions, editionInscriptionId, makerPaymentAddress, metaData, collectionMeta);

          expect(res).to.deep.equal({ error: 'signature is not valid: Error: Invalid signature length' });
          expect(onboardCollectionStub.notCalled).to.be.true;
          expect(createEditionsLaunchpadStub.notCalled).to.be.true;
          expect(getInscriptionInfoByIdStub.notCalled).to.be.true;
        });

        it('should verify taproot signature', async () => {
          // BIP-322 signature with a private key
          const privateKey = 'L3VFeEujGtevx9w18HD1fhRbCH67Az2dpCymeRE1SoPK6XQtaN2k';
          const taprootAddress = 'bc1ppv609nr0vr25u07u95waq5lucwfm6tde4nydujnu8npg4q75mr5sxq8lt3'; // P2TR address
          const timestamp = Math.floor(Date.now() / 1000);
          const messageToSign = `${editionInscriptionId}:${timestamp}`;
          const signatureP2TR = Signer.sign(privateKey, taprootAddress, messageToSign);

          const sig = `${editionInscriptionId}:${timestamp}:${taprootAddress}:${signatureP2TR}`;
          const inscriptionId = '31595888de42b27ab700dac1fb1d7ec8d1659337de6287ec0f052c1efb3107f8i0';

          getInscriptionInfoByIdStub.resolves({
            ...inscriptionInfoResponse,
            address: taprootAddress,
          });

          const res = await editionsLaunchpad.createLaunchpad(price, sig, slug, numberOfEditions, inscriptionId, makerPaymentAddress, metaData, collectionMeta);

          expect(res).to.deep.equal({ id: createdLaunchpadId, slug, numberOfEditions });
          expect(onboardCollectionStub.calledOnceWith(collectionMeta, [], false)).to.be.true;
          expect(createEditionsLaunchpadStub.calledOnceWith(price, slug, numberOfEditions, editionInscriptionId, makerPaymentAddress, createdCollectionId, metaData)).to.be.true;
          expect(getInscriptionInfoByIdStub.calledOnceWith(editionInscriptionId)).to.be.true;
        });

        it('should not create a launchpad with invalid taproot sig', async () => {
          const invalidSignature = '31595888de42b27ab700dac1fb1d7ec8d1659337de6287ec0f052c1efb3107f8i0:1739443493518:bc1p7we8xr6n53rvmcjv38nz4hnxya3u4tc40l4c20vey8j0a8n4k5msxasqhs:AUBR+rgb5YKjK0lDyBTVSqGr8j13JvViBPcMNOweapB5PmTAZfk7j4lhHzkAWubt3cw3R3LZBwLV2A3E1pMQgQ5/';
          const res = await editionsLaunchpad.createLaunchpad(price, invalidSignature, slug, numberOfEditions, editionInscriptionId, makerPaymentAddress, metaData, collectionMeta);

          expect(res).to.deep.equal({ error: 'signature is not valid' });
          expect(onboardCollectionStub.notCalled).to.be.true;
          expect(createEditionsLaunchpadStub.notCalled).to.be.true;
          expect(getInscriptionInfoByIdStub.notCalled).to.be.true;
        });

        it('should fail when provided inscription id does not match signature inscription id', async () => {
          const otherInscription = '123';
          const res = await editionsLaunchpad.createLaunchpad(price, signature, slug, numberOfEditions, otherInscription, makerPaymentAddress, metaData, collectionMeta);

          expect(res).to.deep.equal({ error: 'inscription in signature does not match the editionInscriptionId' });
        });
    });


    describe('#mint()', () => {
        const launchpad = {
            id: 1,
            launchpad_type: 'editions' as 'psbt' | 'editions',
            status: 'active' as 'active' | 'pending' | 'completed',
            edition_inscription: {
                inscription_id: '1234',
            },
            launchpad_phases: [
              {
                id: 1,
                name: "Public",
                price: 1000,
                status: "active" as 'active' | 'pending' | 'completed',
                end_date: null,
                is_public: false,
                created_at: "2025-01-29T14:35:36.950674",
                start_date: 1738161337,
                updated_at: "2025-01-29T14:35:36.950674",
                launchpad_id: 1,
                phase_number: 1,
                total_inscriptions: 10,
                remaining_inscriptions: 10,
              }
            ],
        };
        const feeRates = {
            fastest_fee: 20,
            half_hour_fee: 10,
            hour_fee: 9,
            economy_fee: 5,
            minimum_fee: 2,
            ts: 'asd'
        };
        const chargeAddress = 'bc1qcharge';
        const marektplaceOrderId = '1234';
        const receiveAddress = '0x1234567890';

        const backendOrderWithoutAddress = {
            id: "26c82416-e450-4661-b192-ada4f700bc83",
            charge: {
                address: null,
                amount: 5057
            },
            chainFee: 2283,
            serviceFee: 2774,
            fee: 11,
            baseFee: 2000,
            postage: 546,
            additionalFeeCharged: 0,
            files: null,
            delegates: [
                {
                    delegateId: "618ffb4e23e19566c7567841187a1c424dfd775e4f8cb633a7a3d4836784835fi0"
                }
            ],
            parents: null,
            inscriptionIdPrefix: null,
            allowedSatributes: null,
            additionalFee: null,
            lowPostage: true,
            referral: null,
            receiveAddress,
            webhookUrl: null,
            projectTag: null,
            zeroConf: null,
            status: "ok",
            orderType: "direct",
            state: "prep",
            createdAt: {
                ".sv": "timestamp"
            }
        };

        const backendOrderWithAddress = {
          ...backendOrderWithoutAddress,
          charge: {
            ...backendOrderWithoutAddress.charge,
            address: chargeAddress,
          },
          state: 'waiting-payment',
        };

        let getLaunchpadStub: sinon.SinonStub;
        let getLatestFeeRateStub: sinon.SinonStub;
        let createDirectInscribeOrderStub: sinon.SinonStub;
        let getOrderStub: sinon.SinonStub;
        let checkInsertEditionsLaunchpadOrderStub: sinon.SinonStub;

        beforeEach(() => {
            getLaunchpadStub = sinon.stub(supabase, 'getLaunchpad').resolves([launchpad]);
            getLatestFeeRateStub = sinon.stub(supabase, 'getLatestFeeRate').resolves(feeRates);
            createDirectInscribeOrderStub = sinon.stub(backendApi, 'createDirectInscribeOrder').resolves(backendOrderWithoutAddress);
            getOrderStub = sinon.stub(backendApi, 'getOrder').resolves(backendOrderWithAddress);
            checkInsertEditionsLaunchpadOrderStub = sinon.stub(supabase, 'checkInsertEditionsLaunchpadOrder').resolves({ success: true, order_id: marektplaceOrderId, error_message: '' });
        });

        it('should mint editions', async () => {
            const numberOfEditions = 10;
            const feeRate = 20;
            const expectDelgates = [
                {
                  delegateId: "1234",
                },
                {
                  delegateId: "1234",
                },
                {
                  delegateId: "1234",
                },
                {
                  delegateId: "1234",
                },
                {
                  delegateId: "1234",
                },
                {
                  delegateId: "1234",
                },
                {
                  delegateId: "1234",
                },
                {
                  delegateId: "1234",
                },
                {
                  delegateId: "1234",
                },
                {
                  delegateId: "1234",
                },
            ];

            const res = await editionsLaunchpad.mint(launchpad.id, numberOfEditions, receiveAddress, feeRate);

            const expectData = {
              backend_order_id: "26c82416-e450-4661-b192-ada4f700bc83",
              charge_address: "bc1qcharge",
              charge_amount: 5057,
              editions_number_ordered: 10,
              launchpad_id: 1,
            };

            expect(createDirectInscribeOrderStub.getCall(0).args[0]).to.deep.equal({
              delegates: expectDelgates,
              lowPostage: true,
              receiveAddress: "0x1234567890",
              additionalFee: 1000 + launchpadAdditionalFee, // the is the user defined price + extra ob fee
              fee: 20,
              webhookUrl: "http://mock.com/callback",
            });

            expect(checkInsertEditionsLaunchpadOrderStub.calledOnceWith(expectData)).to.be.true;
            expect(res).to.deep.equal({ 
              id: marektplaceOrderId, 
              charge: backendOrderWithAddress.charge, 
              receiveAddress,
              pricingBreakdown: {
                additionalFee: null,
                additionalFeeCharged: 0,
                baseFee: 2000,
                chainFee: 2283,
                postage: 546,
                serviceFee: 2774,
                itemPrice: 1000,
                platformFee: 1000,
                amount: 5057,
              },
            });
        });

        it('should not mint editions if fee rate is lower than minimum fee rate', async () => {
            const numberOfEditions = 10;
            const feeRate = 1;
            const res = await editionsLaunchpad.mint(launchpad.id, numberOfEditions, receiveAddress, feeRate);
            expect(res).to.deep.equal({ error: `fee rate is lower than minimum fee rate of half_hour_fee: 10 sat/vbyte` });
        });
    });

    describe('#backendWebhookCallback()', () => {
      const backendOrder = {
        id: "26c82416-e450-4661-b192-ada4f700bc83",
        charge: {
            address: 'bc1qcharge',
            amount: 5057
        },
        chainFee: 2283,
        serviceFee: 2774,
        fee: 11,
        baseFee: 2000,
        postage: 546,
        additionalFeeCharged: 0,
        files: null,
        delegates: [
            {
                delegateId: "618ffb4e23e19566c7567841187a1c424dfd775e4f8cb633a7a3d4836784835fi0",
                inscriptionId: "i1",
            },
            {
                delegateId: "618ffb4e23e19566c7567841187a1c424dfd775e4f8cb633a7a3d4836784835fi0",
                inscriptionId: "i2",
            },
            {
                delegateId: "618ffb4e23e19566c7567841187a1c424dfd775e4f8cb633a7a3d4836784835fi0",
                inscriptionId: "i3",
            }
        ],
        parents: null,
        inscriptionIdPrefix: null,
        allowedSatributes: null,
        additionalFee: null,
        lowPostage: true,
        referral: null,
        receiveAddress: '0x1234567890',
        webhookUrl: null,
        projectTag: null,
        zeroConf: null,
        status: "ok",
        orderType: "direct",
        state: "completed",
        createdAt: {
            ".sv": "timestamp"
        }
      };

      let getOrderStub: sinon.SinonStub;
      let editionsLaunchpadBackendOrderCompletedStub: sinon.SinonStub;

      beforeEach(() => {
        getOrderStub = sinon.stub(backendApi, 'getOrder').resolves(backendOrder);
        editionsLaunchpadBackendOrderCompletedStub = sinon.stub(supabase, 'editionsLaunchpadBackendOrderCompleted').resolves({ success: true, error_message: '' });
      });

      it('should update the order status', async () => {
        const res = await editionsLaunchpad.backendWebhookCallback(backendOrder.id);
        const expectedInscriptions = [  'i1', 'i2', 'i3' ];

        expect(res).to.deep.equal({ success: true });
        expect(getOrderStub.calledOnceWith(backendOrder.id)).to.be.true;
        expect(editionsLaunchpadBackendOrderCompletedStub.calledOnceWith(backendOrder.id, expectedInscriptions)).to.be.true;
      });

      it('should not update the order status if the order is not completed', async () => {
        const incompleteOrder = {
          ...backendOrder,
          state: 'prep',
        };

        getOrderStub.resolves(incompleteOrder);

        const res = await editionsLaunchpad.backendWebhookCallback(incompleteOrder.id);
        expect(res).to.deep.equal({ message: 'order is not completed' });
        expect(editionsLaunchpadBackendOrderCompletedStub.notCalled).to.be.true;
      });
  });
});
