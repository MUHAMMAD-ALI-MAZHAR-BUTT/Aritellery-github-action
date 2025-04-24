import { expect } from 'chai';
import sinon, { SinonFakeTimers } from 'sinon';
import MarketplaceListing from '../model/data/marketplaceListing';
import Supabase from '../model/supabase';
import { Database } from '../database.types';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSupabaseResponse } from './helpers';
import * as bitcoinjs from 'bitcoinjs-lib';
import Esplora from '../api/esplora';
import OrdExplorer from '../api/ordExplorer';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { ORDERBOOK_STATUS, ORDERBOOK_TYPE, TRADE_HISTORY_STATUS } from '../conf/constants';
import SatScanner from '../api/satscanner';
import Opi from '../api/opi';
import TransactionListener from '../model/transactionListener';
import WebhookSender from '../api/webhookSender';
chai.use(chaiAsPromised);

describe('MarketplaceListing', () => {
    let marketplaceListing: MarketplaceListing;
    let supabase: Supabase;
    let esplora: Esplora;
    let ordExplorer: OrdExplorer;
    let satScanner: SatScanner;
    let opi: Opi;
    let webhookSender: WebhookSender;
    let transactionListener: TransactionListener;

    let getOrInsertAddressStub: sinon.SinonStub;
    let getPlatformFeeAddressStub: sinon.SinonStub;
    let getInscriptionInfoByIdStub: sinon.SinonStub;
    let getUtxoDetailsWithOrderbookStub: sinon.SinonStub;
    let createUtxoStub: sinon.SinonStub;
    let createInscriptionsStub: sinon.SinonStub;
    let createUtxoContentsStub: sinon.SinonStub;
    let createOrderBooksStub: sinon.SinonStub;
    let getRawTxHexStub: sinon.SinonStub;
    let getOrderDetailStub: sinon.SinonStub;
    let getOrderDetailsStub: sinon.SinonStub;
    let updateOrderbookByIdsStub: sinon.SinonStub;
    let createTradeHistoryStub: sinon.SinonStub;
    let findListingStub: sinon.SinonStub;
    let getOutputStub: sinon.SinonStub;
    let getAddressUtxosStub: sinon.SinonStub;
    let updatePsbtDataByIdStub: sinon.SinonStub;
    let clock: SinonFakeTimers;

    beforeEach(() => {
        ordExplorer = new OrdExplorer("https://testnet-explorer.ordinalsbot.com");
        esplora = new Esplora("https://esplora:80");
        satScanner = new SatScanner("http://satscanner:3000");
        opi = new Opi("http://opi-indexer-brc20-api:3000");
        supabase = new Supabase({ supabase: {} as SupabaseClient<Database>, platformFeeAddress: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' });
        webhookSender = new WebhookSender({orderWebhookUrl: 'https://mock.com/webhook', svixAuthToken: 'mock-secret'});
        transactionListener = new TransactionListener({ supabase, esplora, webhookSender });
        marketplaceListing = new MarketplaceListing({
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
        });

        getOrInsertAddressStub = sinon.stub(supabase, 'getOrInsertAddress');
        getPlatformFeeAddressStub = sinon.stub(supabase, 'getPlatformFeeAddress');
        getInscriptionInfoByIdStub = sinon.stub(ordExplorer, 'getInscriptionInfoById');
        getUtxoDetailsWithOrderbookStub = sinon.stub(supabase, 'getUtxoDetailsWithOrderbook');
        createUtxoStub = sinon.stub(supabase, 'createUtxo');
        createInscriptionsStub = sinon.stub(supabase, 'createInscriptions');
        createUtxoContentsStub = sinon.stub(supabase, 'createUtxoContents');
        createOrderBooksStub = sinon.stub(supabase, 'createOrderBooks');
        getRawTxHexStub = sinon.stub(esplora, 'getRawTransaction');
        getOrderDetailStub = sinon.stub(supabase, 'getOrderDetail');
        getOrderDetailsStub = sinon.stub(supabase, 'getOrderDetails');
        updateOrderbookByIdsStub = sinon.stub(supabase, 'updateOrderbookByIds');
        createTradeHistoryStub = sinon.stub(supabase, 'createTradeHistory');
        findListingStub = sinon.stub(supabase, 'findListing');
        getOutputStub = sinon.stub(ordExplorer, 'getOutput');
        getAddressUtxosStub = sinon.stub(esplora, 'getAddressUtxos');
        updatePsbtDataByIdStub = sinon.stub(supabase, "updatePsbtDataById");

        const originalTime = new Date("2025-02-19T12:05:24.346Z");
        clock = sinon.useFakeTimers(originalTime.getTime());
    });

    afterEach(() => {
        clock.restore();
        sinon.restore();
    });

    describe('#getListings()', () => {
        let getOrderBookListingStub: sinon.SinonStub;
        beforeEach(() => {
            getOrderBookListingStub = sinon.stub(supabase, 'getOrderBookListing');
        });
        const request = {
            "queryFilters": {
                "status": "active"
            },
            "page": 1,
            "itemsPerPage": 50,
            "sort": "id"
        };

        it('should return listings with pagination details when listings exist', async () => {
            const mockData = [
                {
                    "id": 3,
                    "utxo_id": 4,
                    "price": 3600,
                    "psbt": "cHNidP8BAFMCAAAAAYGuib9HkQg3i5zTEjKwQA2KpnbzoMn4ffSq1VWLWrq9AAAAAAD/////AX8PAAAAAAAAF6kUkhV9C6R5Y3vm51+7uR6sxPs1sTiHAAAAAAABAP0PAQIAAAAAAQG9UHG/E4m4Q0BJa6vy43kAxR/Nv4v6n9RV2FmrD1t3vAAAAAAA/f///wEiAgAAAAAAACJRIB+Kd7QBzcuMeBLLE1Dsd1EF64z+8ucvZA/vKNH9vHF6A0AzkXuhVVJxYnx4391h+X5qGVN3jp006Fkv9//rPKj33jyyr04C/ERMECr0YmO0hp+9nDXSW/g7TPFVTFufL72HSiCpkMZv4wHdfXUlpdTFtf4eVv9xADO4RfL4SLImWzYVKawAYwNvcmQBARh0ZXh0L3BsYWluO2NoYXJzZXQ9dXRmLTgABE84MDdoIcCpkMZv4wHdfXUlpdTFtf4eVv9xADO4RfL4SLImWzYVKQAAAAABASsiAgAAAAAAACJRIB+Kd7QBzcuMeBLLE1Dsd1EF64z+8ucvZA/vKNH9vHF6AQMEgwAAAAETQb3Fs8mb9R4ZYOX+fVPRjyDIoM65lc33a71dMFAQdI1KDQhu7Fw+n7BO84Ym2D+i4SGFV5VjU+OpkHEsXs5qmQCDARcg5YHt86lIRwkwFxo+Z2SQqPeVOjaYBEwUtNdf/qvIiiYAAA==",
                    "side": "sell",
                    "maker_payment_address_id": 12,
                    "maker_ordinal_address_id": 13,
                    "merged_psbt": null,
                    "status": "active",
                    "maker_output_value": 3967,
                    "index_in_maker_psbt": 0,
                    "marketplace_id": "6e210197-3d24-40da-b6a3-07f7bfdf6d32",
                    "marketplace_maker_fee": 499,
                    "marketplace_taker_fee": 499,
                    "platform_maker_fee": 499,
                    "platform_taker_fee": 1000,
                    "platform_fee_btc_address_id": 4,
                    "marketplace_fee_btc_address_id": 1,
                    "maker_payment": {
                        "id": 12,
                        "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                        "public_key": "033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c05"
                    },
                    "utxos": {
                        "utxo_contents": [
                            {
                                "inscriptions": {
                                    "inscription_id": "bdba5a8b55d5aaf47df8c9a0f376a68a0d40b03212d39c8b37089147bf89ae81i0"
                                }
                            }
                        ]
                    }
                },
                {
                    "id": 2,
                    "utxo_id": 3,
                    "price": 1500,
                    "psbt": "cHNidP8BAFMCAAAAAdMFrUn24/mbJAfrxfd8zOPoNd8ljPpKpuqyY6ft+l/sAAAAAAD/////AbQHAAAAAAAAF6kUkhV9C6R5Y3vm51+7uR6sxPs1sTiHAAAAAAABAP0PAQIAAAAAAQE9PQd6bkzqRSbeOmQB8ktdBI3EJP3Jt9YgNAzQ4UXh1gAAAAAA/f///wEiAgAAAAAAACJRIB+Kd7QBzcuMeBLLE1Dsd1EF64z+8ucvZA/vKNH9vHF6A0BMGeJW+1HaBdt246+I7eulICBv+eLHHyLCoFYtpSpcP25gLbYIewC3h4kLTT6fUXsKxidNZOW7s6CyInSfdEY0SiDzHYL6+8A0LxZeUcV+8nHiEU8YAMeeNcRZFx6b8FRfDKwAYwNvcmQBARh0ZXh0L3BsYWluO2NoYXJzZXQ9dXRmLTgABE80NjRoIcHzHYL6+8A0LxZeUcV+8nHiEU8YAMeeNcRZFx6b8FRfDAAAAAABASsiAgAAAAAAACJRIB+Kd7QBzcuMeBLLE1Dsd1EF64z+8ucvZA/vKNH9vHF6AQMEgwAAAAETQSCAqaWfyqFX4DJiZ4mZ4RdoYtnrnW0ZEkc5R6AH3hlGfQKWdhK3h5o/PSdAM9guh1oOfcLfa9DkOAliCWYgah2DARcg5YHt86lIRwkwFxo+Z2SQqPeVOjaYBEwUtNdf/qvIiiYAAA==",
                    "side": "sell",
                    "maker_payment_address_id": 12,
                    "maker_ordinal_address_id": 13,
                    "merged_psbt": null,
                    "status": "active",
                    "maker_output_value": 1972,
                    "index_in_maker_psbt": 0,
                    "marketplace_id": "6e210197-3d24-40da-b6a3-07f7bfdf6d32",
                    "marketplace_maker_fee": 499,
                    "marketplace_taker_fee": 499,
                    "platform_maker_fee": 499,
                    "platform_taker_fee": 1000,
                    "platform_fee_btc_address_id": 4,
                    "marketplace_fee_btc_address_id": 1,
                    "maker_payment": {
                        "id": 12,
                        "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                        "public_key": "033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c05"
                    },
                    "utxos": {
                        "utxo_contents": [
                            {
                                "inscriptions": {
                                    "inscription_id": "ec5ffaeda763b2eaa64afa8c25df35e8e3cc7cf7c5eb07249bf9e3f649ad05d3i0"
                                }
                            }
                        ]
                    }
                },
                {
                    "id": 1,
                    "utxo_id": 2,
                    "price": 11000,
                    "psbt": "cHNidP8BAFMCAAAAATdMFrNnYky+LhMvBKF2eR4Qqj2XE9kV9my4wR9yE7dtAQAAAAD/////AeRPAAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HAAAAAAABAP1GAwIAAAAAAQTSSvnx6DMkcs/2QvIuhZv+16x+KA0a5CpE0oFa6mO1ugQAAAAXFgAUpjzG2Nx2HUhFVZAI1EZ2Z/VWPdP/////0kr58egzJHLP9kLyLoWb/tesfigNGuQqRNKBWupjtboDAAAAFxYAFKY8xtjcdh1IRVWQCNRGdmf1Vj3T/////5gYigMgB/V9VjIbepAMF0u8iVj1xPx2PzaUsejo4vZ5AAAAAAD/////0kr58egzJHLP9kLyLoWb/tesfigNGuQqRNKBWupjtboFAAAAFxYAFKY8xtjcdh1IRVWQCNRGdmf1Vj3T/////wawBAAAAAAAABepFMHIgkQhGoD4NIyPPtLT6IzH6o4PhxAnAAAAAAAAIlEg8X6kTn7h+AMnIW+a3OeyEPfGFnb6nuCn3lq5X0equcvPDwAAAAAAABepFJIVfQukeWN75udfu7kerMT7NbE4h1gCAAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HWAIAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4fJKw8AAAAAABepFMHIgkQhGoD4NIyPPtLT6IzH6o4PhwJIMEUCIQD8Qk+pHV1GPRg+o87kMgch/O6aAXRZBl3Rt2oMcyIk3AIgCtDQ4oYEIQ+2BrtKk0gs1MnSDg+VfzG5pFeyC0I1R3sBIQKWBDOnHNbRKiltwHaz5UCnQx993WoPgRly8Eu41xfPNwJIMEUCIQD/7h7PzoHD3Oq0+gO1mrDFqNCFbxWkk3IoC8eK/1rojwIgEmTiigVnci3sNSQv5nAJgFGHgcLgLYiAbC344gv0+AkBIQKWBDOnHNbRKiltwHaz5UCnQx993WoPgRly8Eu41xfPNwFBnuO0Tt5rVTkMsnex7WBL6LscTmgsBjn4QCEku/m2c3fr0o+bjJbgY33adwtr065o8f5cGspTVFysQq4pRGfKx4MCRzBEAiBR4QV82uGFwP8xHwrgExe6joh2PyvECPdC0zypcP2SMQIgAzGESEyh1lw0GyqsNFEv1YIBcpJ0B5zsby80LKzvL14BIQKWBDOnHNbRKiltwHaz5UCnQx993WoPgRly8Eu41xfPNwAAAAABASsQJwAAAAAAACJRIPF+pE5+4fgDJyFvmtznshD3xhZ2+p7gp95auV9HqrnLAQMEgwAAAAETQQEcj7mYHfrHVZrR/x7bq+wqnaJnxEFZP/DJropz/iTfoMPSjkvYv0tnEeuGBoXKjcR57gvnHJq4mHX74xAPZKGDARcgWUpKr12lsUTQ+mtHmH2WYCnYkvvErrsjIUhT6LBTcC4AAA==",
                    "side": "sell",
                    "maker_payment_address_id": 3,
                    "maker_ordinal_address_id": 5,
                    "merged_psbt": null,
                    "status": "active",
                    "maker_output_value": 19501,
                    "index_in_maker_psbt": 0,
                    "marketplace_id": "6e210197-3d24-40da-b6a3-07f7bfdf6d32",
                    "marketplace_maker_fee": 499,
                    "marketplace_taker_fee": 499,
                    "platform_maker_fee": 499,
                    "platform_taker_fee": 1000,
                    "platform_fee_btc_address_id": 4,
                    "marketplace_fee_btc_address_id": 1,
                    "maker_payment": {
                        "id": 3,
                        "address": "2NAurbuXjBK5dztb416bh98ibDS7MKxV75C",
                        "public_key": "02960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf37"
                    },
                    "utxos": {
                        "utxo_contents": [
                            {
                                "inscriptions": {
                                    "inscription_id": "79f6e2e8e8b194363f76fcc4f55889bc4b170c907a1b32567df50720038a1898i0"
                                }
                            }
                        ]
                    }
                }
            ];
            getOrderBookListingStub.resolves(toSupabaseResponse(mockData, null));
            const result = await marketplaceListing.getListings(request.queryFilters, request.page, request.itemsPerPage, request.sort);
            expect(result).to.deep.equal({
                results: mockData,
                count: 3,
                currentPage: 1,
                totalPages: 1,
                totalItems: 3
            });
            expect(getOrderBookListingStub.calledOnce).to.be.true;
        });

        it('should return an empty listings array when no listings exist', async () => {
            getOrderBookListingStub.resolves(toSupabaseResponse([], null));
            const result = await marketplaceListing.getListings(request.queryFilters, request.page, request.itemsPerPage, request.sort);

            expect(result).to.deep.equal({
                results: [],
                count: 0,
                currentPage: 1,
                totalPages: 0,
                totalItems: 0
            });
            expect(getOrderBookListingStub.calledOnce).to.be.true;
        });
    });

    describe('#createMakerPSBT()', () => {

        const request = {
            "utxos": [
                {
                    utxo: 'c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0',
                    price: 1500
                },
                {
                    utxo: 'caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3:0',
                    price: 2500
                }
            ],
            "makerPaymentAddress": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
            "makerPaymentPublicKey": "033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c05",
            "makerOrdinalAddress": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
            "makerOrdinalPublicKey": "e581edf3a948470930171a3e676490a8f7953a3698044c14b4d75ffeabc88a26",
            "marketplaceObj": {
                "id": "6e210197-3d24-40da-b6a3-07f7bfdf6d32",
                "api_key": "someApiKey",
                "name": "Test marketplace",
                "marketplace_fee_btc_address_id": 1,
                "marketplace_maker_fee": 499,
                "marketplace_taker_fee": 499,
                "launchpad_maker_fee": 499,
                "launchpad_taker_fee": 499,
                "launchpad_fee_btc_address_id": 1,
                "description": "marketplace details",
                "url": "",
                "rate_limit_level": 1
            }
        };
        let findSpecialRangesUtxosStub: sinon.SinonStub;
        let getRuneStub: sinon.SinonStub;
        let createRuneStub: sinon.SinonStub;
        let createTokenBalanceStub: sinon.SinonStub;
        let createRareSatRangeStub: sinon.SinonStub;
        let createRareSatRangeSatributesStub: sinon.SinonStub;
        let createPsbtStub: sinon.SinonStub;
        let getUtxoContentsStub: sinon.SinonStub;
        let getInscriptionsWithNoTradableCollectionStub: sinon.SinonStub;
        beforeEach(() => {
            findSpecialRangesUtxosStub = sinon.stub(satScanner, "findSpecialRangesUtxos");
            getRuneStub = sinon.stub(ordExplorer, "getRune");
            createRuneStub = sinon.stub(supabase, "createRune");
            createTokenBalanceStub = sinon.stub(supabase, "createTokenBalance");
            createRareSatRangeStub = sinon.stub(supabase, "createRareSatRange");
            createRareSatRangeSatributesStub = sinon.stub(supabase, "createRareSatRangeSatributes");
            createPsbtStub = sinon.stub(supabase, "createPsbt");
            getUtxoContentsStub = sinon.stub(supabase, "getUtxoContents");
            getInscriptionsWithNoTradableCollectionStub = sinon.stub(supabase, "getInscriptionsWithNoTradableCollection");
        });

        it('should error when inscriptions have a collection that is not tradable', async () => {
            getInscriptionsWithNoTradableCollectionStub.resolves([
                {
                    slug: 'inners',
                    inscription_id: 'ec5ffaeda763b2eaa64afa8c25df35e8e3cc7cf7c5eb07249bf9e3f649ad05d3i0',
                }
            ]);
            
            getOrInsertAddressStub
                .onFirstCall().resolves(3)
                .onSecondCall().resolves(4)
                .onThirdCall().resolves(4);

            getPlatformFeeAddressStub.resolves({
                id: 2,
                address: "2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx",
                public_key: null
            });
            findSpecialRangesUtxosStub.resolves([]);
            getUtxoDetailsWithOrderbookStub.resolves({ data: null })

            getOutputStub
                .onFirstCall().resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32bi0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1421505156510708,
                                1421505156511254
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b",
                        "value": 546
                })
                .onSecondCall().resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3i0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1049142595704814,
                                1049142595705360
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3",
                        "value": 546
                });


            getRawTxHexStub
                .onCall(0).resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000")
                .onCall(1).resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000")
                .onCall(2).resolves("020000000001015cc436defbf9488ff0e41b12196b83c8f2ed48c7f8379ad9305f069020e93adc0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a03407efdb0fd4f56a2245eff2cd7a4bebd6457f01510d850271243a953be1481d0d99cfdae75a2e673a4f5817f61ff10dbd05f22df6d05cff84456dc593b7bcabdc34a203b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcfac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436366821c03b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcf00000000")
                .onCall(3).resolves("020000000001015cc436defbf9488ff0e41b12196b83c8f2ed48c7f8379ad9305f069020e93adc0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a03407efdb0fd4f56a2245eff2cd7a4bebd6457f01510d850271243a953be1481d0d99cfdae75a2e673a4f5817f61ff10dbd05f22df6d05cff84456dc593b7bcabdc34a203b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcfac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436366821c03b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcf00000000");

            createUtxoStub
                .onFirstCall().resolves({ "id": 1 })
                .onSecondCall().resolves({ "id": 2 });

            createInscriptionsStub
                .onFirstCall().resolves([{ "id": 1 }])
                .onSecondCall().resolves([{ "id": 2 }]);
            
            getUtxoContentsStub.resolves({ data: []});
            createUtxoContentsStub
                .onFirstCall().resolves([{ "id": 1 }])
                .onSecondCall().resolves([{ "id": 2 }]);

            createPsbtStub.resolves({ "id": 1 });

            createOrderBooksStub.resolves([
                { "id": 1 },
                { "id": 2 },
            ])

            updatePsbtDataByIdStub.resolves({ data: true, error: null })


            // Call the method
            const result = await marketplaceListing.createMakerPSBT(
                request.utxos,
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                request.makerOrdinalAddress,
                request.makerOrdinalPublicKey,
                request.marketplaceObj,
                ORDERBOOK_TYPE.listing
            );

            expect(result).to.deep.equal({
                error: "utxo contains inscriptions which are not tradable",
                success: false
            });
        });

        it('should create a PSBT and return PSBT string and listing IDs for utxos that contain inscriptions', async () => {
            getInscriptionsWithNoTradableCollectionStub.resolves([]);
            // Mock database operations
            getOrInsertAddressStub
                .onFirstCall().resolves(3)
                .onSecondCall().resolves(4)
                .onThirdCall().resolves(4);

            getPlatformFeeAddressStub.resolves({
                id: 2,
                address: "2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx",
                public_key: null
            });
            findSpecialRangesUtxosStub.resolves([]);
            getUtxoDetailsWithOrderbookStub.resolves({ data: null });

            getOutputStub
                .onFirstCall().resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32bi0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1421505156510708,
                                1421505156511254
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b",
                        "value": 546
                })
                .onSecondCall().resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3i0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1049142595704814,
                                1049142595705360
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3",
                        "value": 546
                });


            getRawTxHexStub
                .onCall(0).resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000")
                .onCall(1).resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000")
                .onCall(2).resolves("020000000001015cc436defbf9488ff0e41b12196b83c8f2ed48c7f8379ad9305f069020e93adc0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a03407efdb0fd4f56a2245eff2cd7a4bebd6457f01510d850271243a953be1481d0d99cfdae75a2e673a4f5817f61ff10dbd05f22df6d05cff84456dc593b7bcabdc34a203b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcfac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436366821c03b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcf00000000")
                .onCall(3).resolves("020000000001015cc436defbf9488ff0e41b12196b83c8f2ed48c7f8379ad9305f069020e93adc0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a03407efdb0fd4f56a2245eff2cd7a4bebd6457f01510d850271243a953be1481d0d99cfdae75a2e673a4f5817f61ff10dbd05f22df6d05cff84456dc593b7bcabdc34a203b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcfac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436366821c03b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcf00000000");

            createUtxoStub
                .onFirstCall().resolves({ "id": 1 })
                .onSecondCall().resolves({ "id": 2 });

            createInscriptionsStub
                .onFirstCall().resolves([{ "id": 1 }])
                .onSecondCall().resolves([{ "id": 2 }]);
            
            getUtxoContentsStub.resolves({ data: []});
            createUtxoContentsStub
                .onFirstCall().resolves([{ "id": 1 }])
                .onSecondCall().resolves([{ "id": 2 }]);

            createPsbtStub.resolves({ "id": 1 });

            createOrderBooksStub.resolves([
                { "id": 1 },
                { "id": 2 },
            ])

            updatePsbtDataByIdStub.resolves({ data: true, error: null })
            // Call the method
            const result = await marketplaceListing.createMakerPSBT(
                request.utxos,
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                request.makerOrdinalAddress,
                request.makerOrdinalPublicKey,
                request.marketplaceObj,
                ORDERBOOK_TYPE.listing
            );

            // Check if the result contains the expected structure
            expect(result).to.be.an('object');
            expect(result).to.have.property('psbt').that.is.a('string');
            expect(result).to.have.property('listingIds').that.is.an('array').with.lengthOf(2);
            expect(result).to.deep.equal({
                psbt: 'cHNidP8BAJwCAAAAAiuzrMzeB0/r94ERUCWOvx8/cqe1FvJU9GlvqQGhXB/JAAAAAAD/////04YFFhbjoOQdTWjWKgxFrvUVrNq0hbDGUF8/uA+t7coAAAAAAP////8CaQcAAAAAAAAXqRSSFX0LpHlje+bnX7u5HqzE+zWxOIftCgAAAAAAABepFJIVfQukeWN75udfu7kerMT7NbE4hwAAAAAAAQErIgIAAAAAAAAiUSAfine0Ac3LjHgSyxNQ7HdRBeuM/vLnL2QP7yjR/bxxegEDBIMAAAABFyDlge3zqUhHCTAXGj5nZJCo95U6NpgETBS011/+q8iKJgABASsiAgAAAAAAACJRIB+Kd7QBzcuMeBLLE1Dsd1EF64z+8ucvZA/vKNH9vHF6AQMEgwAAAAEXIOWB7fOpSEcJMBcaPmdkkKj3lTo2mARMFLTXX/6ryIomAAAA',
                listingIds: [1, 2]
            });
            
            // Ensure all database operations were called with correct arguments
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.makerPaymentAddress,request.makerPaymentPublicKey);
            expect(getOrInsertAddressStub.secondCall.args[0]).to.deep.equal('tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea',request.makerOrdinalPublicKey);
            expect(getOrInsertAddressStub.thirdCall.args[0]).to.deep.equal('tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea',request.makerOrdinalPublicKey);
            expect(getPlatformFeeAddressStub.calledOnce).to.be.true;
            expect(findSpecialRangesUtxosStub.calledOnce).to.be.true;
            expect(getOutputStub.callCount).to.equal(2);
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0");
            expect(getOutputStub.secondCall.args[0]).to.deep.equal("caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3:0");
            expect(getUtxoDetailsWithOrderbookStub.callCount).to.equal(2);
            expect(getRawTxHexStub.callCount).to.equal(4);
            expect(createUtxoStub.callCount).to.equal(2);
            expect(createInscriptionsStub.callCount).to.equal(2);
            expect(createUtxoContentsStub.callCount).to.equal(2);
            expect(createUtxoContentsStub.callCount).to.equal(2);
            expect(createPsbtStub.callCount).to.equal(1);
            expect(createOrderBooksStub.callCount).to.equal(1);
            expect(createOrderBooksStub.firstCall.args[0]).to.deep.equal([
                {
                    utxo_id: 1,
                    psbt_id: 1,
                    price: 1500,
                    maker_payment_address_id: 3,
                    maker_ordinal_address_id: 4,
                    platform_maker_fee: 499,
                    platform_taker_fee: 499,
                    maker_output_value: 1897,
                    index_in_maker_psbt: 0,
                    status: 'pending_maker_confirmation',
                    marketplace_id: '6e210197-3d24-40da-b6a3-07f7bfdf6d32',
                    marketplace_maker_fee: 499,
                    marketplace_taker_fee: 499,
                    marketplace_fee_btc_address_id: 1,
                    platform_fee_btc_address_id: 2,
                    side: 'sell',
                    listing_type: "listing",
                    timestamp: '2025-02-19T12:05:24.346Z'
                },
                {
                    utxo_id: 2,
                    psbt_id: 1,
                    price: 2500,
                    maker_payment_address_id: 3,
                    maker_ordinal_address_id: 4,
                    platform_maker_fee: 499,
                    platform_taker_fee: 499,
                    maker_output_value: 2797,
                    index_in_maker_psbt: 1,
                    status: 'pending_maker_confirmation',
                    marketplace_id: '6e210197-3d24-40da-b6a3-07f7bfdf6d32',
                    marketplace_maker_fee: 499,
                    marketplace_taker_fee: 499,
                    marketplace_fee_btc_address_id: 1,
                    platform_fee_btc_address_id: 2,
                    side: 'sell',
                    listing_type: "listing",
                    timestamp: '2025-02-19T12:05:24.346Z'
                }
            ]);
        });
        
        it('should create a PSBT and return PSBT string and listing IDs for utxos that contain special ranges and inscriptions', async () => {
            getInscriptionsWithNoTradableCollectionStub.resolves([]);

            // Mock database operations
            getOrInsertAddressStub
                .onFirstCall().resolves(3)
                .onSecondCall().resolves(4)
                .onThirdCall().resolves(4);

            getPlatformFeeAddressStub.resolves({
                id: 2,
                address: "2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx",
                public_key: null
            });
            findSpecialRangesUtxosStub.resolves([
                {
                    "start": 392609626005,
                    "output": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0",
                    "size": 546,
                    "offset": 0,
                    "satributes": [
                        "vintage"
                    ]
                },
                {
                    "start": 392609628888,
                    "output": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0",
                    "size": 6000,
                    "offset": 1,
                    "satributes": [
                        "vintage"
                    ]
                },
                {
                    "start": 392609626005,
                    "output": "caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3:0",
                    "size": 546,
                    "offset": 0,
                    "satributes": [
                        "block-78",
                    ]
                },
            ]);
            getUtxoDetailsWithOrderbookStub.resolves({ data: null });

            getOutputStub
                .onFirstCall().resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32bi0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1421505156510708,
                                1421505156511254
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b",
                        "value": 546
                })
                .onSecondCall().resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3i0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1049142595704814,
                                1049142595705360
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3",
                        "value": 546
                });


            getRawTxHexStub
                .onCall(0).resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000")
                .onCall(1).resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000")
                .onCall(2).resolves("020000000001015cc436defbf9488ff0e41b12196b83c8f2ed48c7f8379ad9305f069020e93adc0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a03407efdb0fd4f56a2245eff2cd7a4bebd6457f01510d850271243a953be1481d0d99cfdae75a2e673a4f5817f61ff10dbd05f22df6d05cff84456dc593b7bcabdc34a203b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcfac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436366821c03b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcf00000000")
                .onCall(3).resolves("020000000001015cc436defbf9488ff0e41b12196b83c8f2ed48c7f8379ad9305f069020e93adc0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a03407efdb0fd4f56a2245eff2cd7a4bebd6457f01510d850271243a953be1481d0d99cfdae75a2e673a4f5817f61ff10dbd05f22df6d05cff84456dc593b7bcabdc34a203b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcfac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436366821c03b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcf00000000");

            createUtxoStub
                .onFirstCall().resolves({ "id": 1 })
                .onSecondCall().resolves({ "id": 2 });
                
            createRareSatRangeStub
                .onFirstCall().resolves({ "id": 1 })
                .onSecondCall().resolves({ "id": 2 })
                .onThirdCall().resolves({ "id": 3 });
            
            createRareSatRangeSatributesStub
                .onFirstCall().resolves({ "id": 1 })
                .onSecondCall().resolves({ "id": 2 })
                .onThirdCall().resolves({ "id": 3 });

            createInscriptionsStub
                .onFirstCall().resolves([{ "id": 1 }])
                .onSecondCall().resolves([{ "id": 2 }]);

            getUtxoContentsStub.resolves({ data: []})
            createUtxoContentsStub
                .onFirstCall().resolves([{ "id": 1 }])
                .onSecondCall().resolves([{ "id": 2 }]);

            createPsbtStub.resolves([
                { "id": 1 },
                { "id": 2 },
            ])

            createOrderBooksStub.resolves([
                { "id": 1 },
                { "id": 2 },
            ])

            updatePsbtDataByIdStub.resolves({ data: true, error: null })

            // Call the method
            const result = await marketplaceListing.createMakerPSBT(
                request.utxos,
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                request.makerOrdinalAddress,
                request.makerOrdinalPublicKey,
                request.marketplaceObj,
                ORDERBOOK_TYPE.listing
            );

            // Check if the result contains the expected structure
            expect(result).to.be.an('object');
            expect(result).to.have.property('psbt').that.is.a('string');
            expect(result).to.have.property('listingIds').that.is.an('array').with.lengthOf(2);
            expect(result).to.deep.equal({
                psbt: 'cHNidP8BAJwCAAAAAiuzrMzeB0/r94ERUCWOvx8/cqe1FvJU9GlvqQGhXB/JAAAAAAD/////04YFFhbjoOQdTWjWKgxFrvUVrNq0hbDGUF8/uA+t7coAAAAAAP////8CaQcAAAAAAAAXqRSSFX0LpHlje+bnX7u5HqzE+zWxOIftCgAAAAAAABepFJIVfQukeWN75udfu7kerMT7NbE4hwAAAAAAAQErIgIAAAAAAAAiUSAfine0Ac3LjHgSyxNQ7HdRBeuM/vLnL2QP7yjR/bxxegEDBIMAAAABFyDlge3zqUhHCTAXGj5nZJCo95U6NpgETBS011/+q8iKJgABASsiAgAAAAAAACJRIB+Kd7QBzcuMeBLLE1Dsd1EF64z+8ucvZA/vKNH9vHF6AQMEgwAAAAEXIOWB7fOpSEcJMBcaPmdkkKj3lTo2mARMFLTXX/6ryIomAAAA',
                listingIds: [1, 2]
            });

            // Ensure all database operations were called with correct arguments
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.makerPaymentAddress,request.makerPaymentPublicKey);
            expect(getOrInsertAddressStub.secondCall.args[0]).to.deep.equal('tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea',request.makerOrdinalPublicKey);
            expect(getOrInsertAddressStub.thirdCall.args[0]).to.deep.equal('tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea',request.makerOrdinalPublicKey);
            expect(getPlatformFeeAddressStub.calledOnce).to.be.true;
            expect(findSpecialRangesUtxosStub.calledOnce).to.be.true;
            expect(getOutputStub.callCount).to.equal(2);
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0");
            expect(getOutputStub.secondCall.args[0]).to.deep.equal("caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3:0");
            expect(getUtxoDetailsWithOrderbookStub.callCount).to.equal(2);
            expect(getRawTxHexStub.callCount).to.equal(4);
            expect(createUtxoStub.callCount).to.equal(2);
            expect(createInscriptionsStub.callCount).to.equal(2);
            expect(createInscriptionsStub.firstCall.args[0]).to.deep.equal([{
                "inscription_id": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32bi0"
            }]);
            expect(createInscriptionsStub.secondCall.args[0]).to.deep.equal([{
                "inscription_id": "caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3i0"
            }]);
            expect(createRareSatRangeStub.callCount).to.equal(3);
            expect(createRareSatRangeSatributesStub.callCount).to.equal(3);
            expect(createUtxoContentsStub.callCount).to.equal(2);
            expect(createUtxoContentsStub.firstCall.args[0]).to.deep.equal([
                { utxo_id: 1, inscription_id: 1 },
                { utxo_id: 1, rare_sat_range_id: 1 },
                { utxo_id: 1, rare_sat_range_id: 2 }
            ]);
            expect(createUtxoContentsStub.secondCall.args[0]).to.deep.equal([
                { utxo_id: 2, inscription_id: 2 },
                { utxo_id: 2, rare_sat_range_id: 3 }
            ]);
            expect(createOrderBooksStub.calledOnce).to.be.true;
        });

        it('should create a PSBT and return PSBT string and listing IDs for the utxos that contain runes', async () => {
            getInscriptionsWithNoTradableCollectionStub.resolves([]);

            // Mock database operations
            getOrInsertAddressStub
                .onFirstCall().resolves(3)
                .onSecondCall().resolves(4)
                .onThirdCall().resolves(4);

            getPlatformFeeAddressStub.resolves({
                id: 2,
                address: "2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx",
                public_key: null
            });
            findSpecialRangesUtxosStub.resolves([]);
            getUtxoDetailsWithOrderbookStub.resolves({ data: null });

            getOutputStub
                .onFirstCall().resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [],
                        "runes": [
                            [
                                "COOK•RUNES•ON•TESTNET",
                                {
                                    "amount": 22800,
                                    "divisibility": 2,
                                    "symbol": "🤖"
                                }
                            ]
                        ],
                        "sat_ranges": [
                            [
                                1421505156510708,
                                1421505156511254
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b",
                        "value": 546
                })
                .onSecondCall().resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [],
                        "runes": [
                            [
                                "ORDINALSBOT•TESTING•RUNE",
                                {
                                    "amount": 23800,
                                    "divisibility": 2,
                                    "symbol": "🤖"
                                }
                            ], [
                                "ORDINALSBOT•RUNE",
                                {
                                    "amount": 24800,
                                    "divisibility": 2,
                                    "symbol": "🤖"
                                }
                            ]
                        ],
                        "sat_ranges": [
                            [
                                1049142595704814,
                                1049142595705360
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3",
                        "value": 546
                });

            getRuneStub
                .onFirstCall().resolves({
                        "entry": {
                            "divisibility": 0,
                            "number": 6058,
                            "spaced_rune": "COOK•RUNES•ON•TESTNET"
                        }
                })
                .onSecondCall().resolves({
                        "entry": {
                            "divisibility": 0,
                            "number": 6058,
                            "spaced_rune": "ORDINALSBOT•TESTING•RUNE"
                        }
                })
                .onThirdCall().resolves({
                        "entry": {
                            "divisibility": 0,
                            "number": 6058,
                            "spaced_rune": "ORDINALSBOT•RUNE"
                        }
                });

            getRawTxHexStub
                .onCall(0).resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000")
                .onCall(1).resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000")
                .onCall(2).resolves("020000000001015cc436defbf9488ff0e41b12196b83c8f2ed48c7f8379ad9305f069020e93adc0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a03407efdb0fd4f56a2245eff2cd7a4bebd6457f01510d850271243a953be1481d0d99cfdae75a2e673a4f5817f61ff10dbd05f22df6d05cff84456dc593b7bcabdc34a203b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcfac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436366821c03b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcf00000000")
                .onCall(3).resolves("020000000001015cc436defbf9488ff0e41b12196b83c8f2ed48c7f8379ad9305f069020e93adc0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a03407efdb0fd4f56a2245eff2cd7a4bebd6457f01510d850271243a953be1481d0d99cfdae75a2e673a4f5817f61ff10dbd05f22df6d05cff84456dc593b7bcabdc34a203b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcfac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436366821c03b4077d47f53a58044d3407a19aabccbfbd1bce0983e76ff98c5708d7e854fcf00000000");

            createUtxoStub
                .onFirstCall().resolves({ "id": 1 })
                .onSecondCall().resolves({ "id": 2 });

            createRuneStub
                .onFirstCall().resolves({ "id": 1 })
                .onSecondCall().resolves({ "id": 2 })
                .onThirdCall().resolves({ "id": 3 });

            createTokenBalanceStub
                .onFirstCall().resolves({ "id": 1 })
                .onSecondCall().resolves({ "id": 2 })
                .onThirdCall().resolves({ "id": 3 });

            getUtxoContentsStub.resolves({ data: []})
            createUtxoContentsStub
                .onFirstCall().resolves([{ "id": 1 }])
                .onSecondCall().resolves([{ "id": 2 }, { "id": 3 }]);

            createPsbtStub.resolves([
                { "id": 1 },
                { "id": 2 },
            ])

            createOrderBooksStub.resolves([
                { "id": 1 },
                { "id": 2 },
            ])

            updatePsbtDataByIdStub.resolves({ data: true, error: null })

            // Call the method
            const result = await marketplaceListing.createMakerPSBT(
                request.utxos,
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                request.makerOrdinalAddress,
                request.makerOrdinalPublicKey,
                request.marketplaceObj,
                ORDERBOOK_TYPE.listing
            );

            // Check if the result contains the expected structure
            expect(result).to.be.an('object');
            expect(result).to.have.property('psbt').that.is.a('string');
            expect(result).to.have.property('listingIds').that.is.an('array').with.lengthOf(2);
            expect(result).to.deep.equal({
                psbt: 'cHNidP8BAJwCAAAAAiuzrMzeB0/r94ERUCWOvx8/cqe1FvJU9GlvqQGhXB/JAAAAAAD/////04YFFhbjoOQdTWjWKgxFrvUVrNq0hbDGUF8/uA+t7coAAAAAAP////8CaQcAAAAAAAAXqRSSFX0LpHlje+bnX7u5HqzE+zWxOIftCgAAAAAAABepFJIVfQukeWN75udfu7kerMT7NbE4hwAAAAAAAQErIgIAAAAAAAAiUSAfine0Ac3LjHgSyxNQ7HdRBeuM/vLnL2QP7yjR/bxxegEDBIMAAAABFyDlge3zqUhHCTAXGj5nZJCo95U6NpgETBS011/+q8iKJgABASsiAgAAAAAAACJRIB+Kd7QBzcuMeBLLE1Dsd1EF64z+8ucvZA/vKNH9vHF6AQMEgwAAAAEXIOWB7fOpSEcJMBcaPmdkkKj3lTo2mARMFLTXX/6ryIomAAAA',
                listingIds: [1, 2]
            });

            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.makerPaymentAddress,request.makerPaymentPublicKey);
            expect(getOrInsertAddressStub.secondCall.args[0]).to.deep.equal('tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea',request.makerOrdinalPublicKey);
            expect(getOrInsertAddressStub.thirdCall.args[0]).to.deep.equal('tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea',request.makerOrdinalPublicKey);
            expect(getPlatformFeeAddressStub.calledOnce).to.be.true;
            expect(findSpecialRangesUtxosStub.calledOnce).to.be.true;
            expect(getOutputStub.callCount).to.equal(2);
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0");
            expect(getOutputStub.secondCall.args[0]).to.deep.equal("caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3:0");
            expect(getUtxoDetailsWithOrderbookStub.callCount).to.equal(2);
            expect(getRawTxHexStub.callCount).to.equal(4);
            expect(createUtxoStub.callCount).to.equal(2);
            expect(getRuneStub.callCount).to.equal(3);
            expect(getRuneStub.firstCall.args[0]).to.deep.equal("COOK•RUNES•ON•TESTNET");
            expect(getRuneStub.secondCall.args[0]).to.deep.equal("ORDINALSBOT•TESTING•RUNE");
            expect(getRuneStub.thirdCall.args[0]).to.deep.equal("ORDINALSBOT•RUNE");
            expect(createRuneStub.callCount).to.equal(3);
            expect(createTokenBalanceStub.callCount).to.equal(3);
            expect(createUtxoContentsStub.callCount).to.equal(2);
            expect(createOrderBooksStub.calledOnce).to.be.true;
        });

        it('should return an error for Utxos already listed', async () => {
            // Mock database operations
            getOrInsertAddressStub
                .onFirstCall().resolves(3)
                .onSecondCall().resolves(4)
                .onThirdCall().resolves(4);
            
            findSpecialRangesUtxosStub.resolves([]);
            getPlatformFeeAddressStub.resolves({
                id: 2,
                address: "2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx",
                public_key: null
            })

            getOutputStub
                .onFirstCall().resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32bi0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1421505156510708,
                                1421505156511254
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b",
                        "value": 546
                })
                .onSecondCall().resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3i0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1049142595704814,
                                1049142595705360
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3",
                        "value": 546
                });

            getUtxoDetailsWithOrderbookStub.onFirstCall().resolves({
                "data": {
                    "id": 1,
                    "utxo": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0",
                    "is_spent": true,
                    "orderbook": [{
                        "status": ORDERBOOK_STATUS.active
                    }]

                }
            }).onSecondCall().resolves({ data: null });

            // Call the method
            const result = await marketplaceListing.createMakerPSBT(
                request.utxos,
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                request.makerOrdinalAddress,
                request.makerOrdinalPublicKey,
                request.marketplaceObj,
                ORDERBOOK_TYPE.listing
            );
            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("utxos already listed");

            // Ensure all database operations were called with correct arguments
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.makerPaymentAddress,request.makerPaymentPublicKey);
            expect(getPlatformFeeAddressStub.calledOnce).to.be.true;
            expect(findSpecialRangesUtxosStub.calledOnce).to.be.true;
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0");
            expect(getOutputStub.secondCall.args[0]).to.deep.equal("caedad0fb83f5f50c6b085b4daac15f5ae450c2ad6684d1de4a0e316160586d3:0");
            expect(getUtxoDetailsWithOrderbookStub.callCount).to.equal(2);
        });

        it('should return an error for Utxo address mismatch', async () => {
            // Mock database operations
            getOrInsertAddressStub
                .onFirstCall().resolves(3)
                .onSecondCall().resolves(4)
                .onThirdCall().resolves(4);
            
            findSpecialRangesUtxosStub.resolves([]);
            getPlatformFeeAddressStub.resolves({
                id: 2,
                address: "2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx",
                public_key: null
            })

            getOutputStub
                .onFirstCall().resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629yk3",
                        "indexed": true,
                        "inscriptions": [
                            "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32bi0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1421505156510708,
                                1421505156511254
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b",
                        "value": 546
                });

            getUtxoDetailsWithOrderbookStub.onFirstCall().resolves({
                "data": {
                    "id": 1,
                    "utxo": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0",
                    "is_spent": true,
                    "orderbook": [{
                        "status": ORDERBOOK_STATUS.active
                    }]

                }
            }).onSecondCall().resolves({ data: null });

            // Call the method
            const result = await marketplaceListing.createMakerPSBT(
                request.utxos,
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                request.makerOrdinalAddress,
                request.makerOrdinalPublicKey,
                request.marketplaceObj,
                ORDERBOOK_TYPE.listing
            );
            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("utxo address mismatch");

            // Ensure all database operations were called with correct arguments
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.makerPaymentAddress,request.makerPaymentPublicKey);
            expect(getPlatformFeeAddressStub.calledOnce).to.be.true;
            expect(findSpecialRangesUtxosStub.calledOnce).to.be.true;
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0");
            expect(getUtxoDetailsWithOrderbookStub.callCount).to.equal(1);
        });
    });

    describe('#updateSignedPSBT()', () => {
        const request = {
            "listingIds": [1, 2],
            "signedPSBT": "somesignedPSBT",
            "mockMarketplaceId": "6e210197-3d24-40da-b6a3-07f7bfdf6d32"
        };
        
        let updatePsbtByIdsStub: sinon.SinonStub;
        beforeEach(() => {
            updatePsbtByIdsStub = sinon.stub(supabase, "updatePsbtByIds");
        });

        it('should return an error if getOrderDetails returns an error', async () => {
            // Mock getOrderDetails to return an error
            getOrderDetailsStub.resolves({ data: null, error: new Error('listing not found') });

            // Assert that the method return the expected error
            const result = await marketplaceListing.updateSignedPSBT(request.listingIds, request.mockMarketplaceId, request.signedPSBT, ORDERBOOK_TYPE.listing)
            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("listing not found");
            // Ensure getOrderDetails was called with the correct arguments
            expect(getOrderDetailsStub.calledOnceWithExactly(
                request.listingIds,
                request.mockMarketplaceId,
                ORDERBOOK_STATUS.pending_maker_confirmation,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });

        it('should return an error if the listing IDs are invalid', async () => {
            // Mock getOrderDetails to return fewer results than listingIds length
            getOrderDetailsStub.resolves({ data: [], error: null });

            // Assert that the method return the expected error
            const result = await marketplaceListing.updateSignedPSBT(request.listingIds, request.mockMarketplaceId, request.signedPSBT, ORDERBOOK_TYPE.listing)
            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("listing not found");

            // Ensure getOrderDetails was called with the correct arguments
            expect(getOrderDetailsStub.calledOnce).to.be.true;
            expect(getOrderDetailsStub.calledOnceWithExactly(
                request.listingIds,
                request.mockMarketplaceId,
                ORDERBOOK_STATUS.pending_maker_confirmation,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });

        it('should update the orderbook with the signed PSBT when valid', async () => {
            const mockOrderbookData = [{ id: 1, psbt_id: 1 }, { id: 2, psbt_id: 1 }];
            const mockUpdatedData = [{ status: ORDERBOOK_STATUS.active }];

            // Mock getOrderDetails to return the correct number of results
            getOrderDetailsStub.resolves({ data: mockOrderbookData, error: null });
            
            // Mocked update psbt
            updatePsbtByIdsStub.resolves({ data: true, error: null })
            // Mock updateOrderbookByIds to return updated data
            updateOrderbookByIdsStub.resolves(mockUpdatedData);

            // Call the method
            const result = await marketplaceListing.updateSignedPSBT(request.listingIds, request.mockMarketplaceId, request.signedPSBT, ORDERBOOK_TYPE.listing);

            // Assert that the result is as expected
            expect(result).to.deep.equal({ message: 'Signed PSBT is updated successfully' });

            // Ensure getOrderDetails was called correctly
            expect(getOrderDetailsStub.calledOnce).to.be.true;
            expect(getOrderDetailsStub.calledOnceWithExactly(
                request.listingIds,
                request.mockMarketplaceId,
                ORDERBOOK_STATUS.pending_maker_confirmation,
                ORDERBOOK_TYPE.listing
            )).to.be.true;

            // Ensure updateOrderbookByIds was called with the correct arguments
            expect(updateOrderbookByIdsStub.calledOnce).to.be.true;
            expect(updateOrderbookByIdsStub.calledOnceWithExactly(
                { status: ORDERBOOK_STATUS.active },
                request.listingIds
            )).to.be.true;
        });
    });

    describe('#reListMakerPSBT()', () => {
        const request = {
            "id": 1,
            "price": 2500,
            "signedPSBT": "mock-signed-psbt",
            "makerPaymentAddress": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
            "makerPaymentPublicKey": "033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c05",
            "makerOrdinalPublicKey": "e581edf3a948470930171a3e676490a8f7953a3698044c14b4d75ffeabc88a26",
            "marketplaceObj": {
                "id": "6e210197-3d24-40da-b6a3-07f7bfdf6d32",
                "api_key": "someApiKey",
                "name": "Test marketplace",
                "marketplace_fee_btc_address_id": 1,
                "marketplace_maker_fee": 499,
                "marketplace_taker_fee": 499,
                "launchpad_maker_fee": 499,
                "launchpad_taker_fee": 499,
                "launchpad_fee_btc_address_id": 1,
                "description": "marketplace details",
                "url": "",
                "rate_limit_level": 1
            }
        };
        let removeListingDataStub: sinon.SinonStub;
        let createPsbtStub: sinon.SinonStub;
        let cloneUtxoAndDataStub: sinon.SinonStub;
        beforeEach(() => {
            removeListingDataStub = sinon.stub(marketplaceListing, "removeListingData");
            createPsbtStub = sinon.stub(supabase, "createPsbt");
            cloneUtxoAndDataStub = sinon.stub(supabase, "cloneUtxoAndData");
        });

        it('should re-list the maker PSBT and return the base64 PSBT string', async () => {
            // Mock database operations
            getOrInsertAddressStub.resolves(3);
            // Mock data returned from findListing
            const mockListingData = {
                id: request.id,
                maker_payment_address_id: 3,
                marketplace_id: request.marketplaceObj.id,
                status: ORDERBOOK_STATUS.active,
                platform_fee_btc_address_id: 10,
                maker_ordinal_address_id: 11
            };
            findListingStub.resolves({ data: mockListingData, error: null });

            getUtxoDetailsWithOrderbookStub.resolves({
                data: {
                    "id": 1,
                    "utxo": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0",
                    "is_spent": false
                }
            });

            getOutputStub.resolves({
                    "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                    "indexed": true,
                    "inscriptions": [
                        "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32bi0"
                    ],
                    "runes": {},
                    "sat_ranges": [
                        [
                            1421505156510708,
                            1421505156511254
                        ]
                    ],
                    "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                    "spent": false,
                    "transaction": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b",
                    "value": 546
            });
            
            removeListingDataStub.resolves({ txId: "48812eac63cb4907548c17de07caa5d5f753996cf6dafe4678c7f7d5f58f3b69" });
            getRawTxHexStub.resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000")
            cloneUtxoAndDataStub.resolves({ data:[{ id: 2 }], error: null});
            createPsbtStub.resolves({ id: 2 });
            createOrderBooksStub.resolves([{ id: 2 }]);

            const result = await marketplaceListing.reListMakerPSBT(
                request.id,
                request.price,
                request.signedPSBT,
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                request.makerOrdinalPublicKey,
                request.marketplaceObj
            );

            // Check if the result contains the expected structure
            expect(result).to.be.an('object');
            expect(result).to.have.property('psbt').that.is.a('string');
            expect(result).to.deep.equal({
                listingId: 2,
                psbt: 'cHNidP8BAFMCAAAAAWk7j/XV98d4Rv7a9myZU/fVpcoH3heMVAdJy2OsLoFIAAAAAAD/////Ae0KAAAAAAAAF6kUkhV9C6R5Y3vm51+7uR6sxPs1sTiHAAAAAAABASsiAgAAAAAAACJRIB+Kd7QBzcuMeBLLE1Dsd1EF64z+8ucvZA/vKNH9vHF6AQMEgwAAAAEXIOWB7fOpSEcJMBcaPmdkkKj3lTo2mARMFLTXX/6ryIomAAA=',
            });

            // Ensure all database operations were called with correct arguments
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.makerPaymentAddress,request.makerPaymentPublicKey);
            expect(findListingStub.calledOnce).to.be.true;
            expect(findListingStub.calledOnceWithExactly({
                "id": request.id,
                "maker_payment_address_id": 3,
                "marketplace_id": request.marketplaceObj.id,
                "status": ORDERBOOK_STATUS.active
            })
            ).to.be.true;
            
            expect(getUtxoDetailsWithOrderbookStub.calledOnce).to.be.true;
            expect(getOutputStub.calledOnce).to.true;
            expect(getOutputStub.calledOnceWithExactly("c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0")).to.be.true;
            expect(removeListingDataStub.calledOnce).to.true;
            expect(removeListingDataStub.calledOnceWithExactly(
                request.id,
                request.makerPaymentAddress,
                request.marketplaceObj.id,
                request.signedPSBT
            )).to.be.true;
            expect(getRawTxHexStub.callCount).to.equal(2);
            expect(cloneUtxoAndDataStub.calledOnce).to.true;
            expect(cloneUtxoAndDataStub.calledOnceWithExactly("48812eac63cb4907548c17de07caa5d5f753996cf6dafe4678c7f7d5f58f3b69:0", "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0")).to.be.true;
            expect(createPsbtStub.calledOnce).to.true;
            expect(createOrderBooksStub.calledOnce).to.true;
            expect(createOrderBooksStub.firstCall.args[0]).to.deep.equal([
                {
                    utxo_id: 2,
                    psbt_id: 2,
                    price: 2500,
                    maker_payment_address_id: 3,
                    maker_ordinal_address_id: 11,
                    platform_maker_fee: 499,
                    platform_taker_fee: 499,
                    maker_output_value: 2797,
                    index_in_maker_psbt: 0,
                    status: 'pending_maker_confirmation',
                    marketplace_id: '6e210197-3d24-40da-b6a3-07f7bfdf6d32',
                    marketplace_maker_fee: 499,
                    marketplace_taker_fee: 499,
                    marketplace_fee_btc_address_id: 1,
                    platform_fee_btc_address_id: 10,
                    side: 'sell',
                    timestamp: '2025-02-19T12:05:24.346Z'
                }
            ]);
            
        });

        it('should return an error if listing retrieval fails', async () => {
            // Mock database operations
            getOrInsertAddressStub.resolves(3);

            findListingStub.resolves({ data: null, error: new Error('listing not found') });

            // Call the method
            const result = await marketplaceListing.reListMakerPSBT(
                request.id,
                request.price,
                request.signedPSBT,
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                request.makerOrdinalPublicKey,
                request.marketplaceObj
            );
            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("listing not found");
            

            // Ensure all database operations were called with correct arguments
            expect(getOrInsertAddressStub.calledOnceWithExactly(request.makerPaymentAddress, request.makerPaymentPublicKey)).to.be.true;
            expect(findListingStub.calledOnce).to.be.true;
        });
    });

    describe('#updateListingToDeList', () => {
        const request = {
            "id":1,
            "makerPaymentAddress": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
            "makerPaymentPublicKey": "033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c05",
            "marketplaceId": "6e210197-3d24-40da-b6a3-07f7bfdf6d32"
        };
        
        let getLatestFeeRateStub: sinon.SinonStub;
        beforeEach(() => {
            getLatestFeeRateStub = sinon.stub(supabase, "getLatestFeeRate");
        });

        it('should update listing and return PSBT successfully', async () => {
            const mockListing = {
                utxos: { utxo: 'c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0' },
                maker_ordinal: { id: 6, address: 'tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea', public_key: 'e581edf3a948470930171a3e676490a8f7953a3698044c14b4d75ffeabc88a26' },
                maker_payment: { id: 7, address: request.makerPaymentAddress }
            };

            // Mock successful listing retrieval
            getOrderDetailStub.resolves({ data: mockListing, error: null });
            getLatestFeeRateStub.resolves({ fastest_fee: 3 });
            const createTransferPSBTStub = sinon.stub(marketplaceListing ,'createTransferPSBT').resolves({
                psbtBase64: 'base64string',
                makerOrdinalInputIndices: [0],
                makerPaymentInputIndices: [1, 2]
            });
            
            const result = await marketplaceListing.updateListingToDeList(request.id, request.makerPaymentAddress, request.makerPaymentPublicKey, request.marketplaceId);

            expect(result).to.deep.equal({
                psbtBase64: 'base64string',
                makerOrdinalInputIndices: [0],
                makerPaymentInputIndices: [
                    1,
                    2
                ]
            });

            expect(getOrderDetailStub.calledOnceWithExactly({
                'id': request.id,
                'status': ORDERBOOK_STATUS.active,
                'listing_type': ORDERBOOK_TYPE.listing,
                'marketplace_id': request.marketplaceId
            })).to.be.true;
            expect(getLatestFeeRateStub.calledOnce).to.be.true;
            expect(createTransferPSBTStub.calledOnceWithExactly(
                [
                    {
                        output: 'c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0',
                        receiverOrdinalAddress: 'tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea'
                    }
                ],
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                "e581edf3a948470930171a3e676490a8f7953a3698044c14b4d75ffeabc88a26",
                sinon.match.number // Add this for feeRate
            )).to.be.true;
        });

        it('should return an error if listing retrieval fails', async () => {
            // Mock successful listing retrieval
            getOrderDetailStub.resolves({ data: null, error: new Error('listing not found') });

            const result = await marketplaceListing.updateListingToDeList(
                request.id,
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                request.marketplaceId
            );
            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("listing not found");

            expect(getOrderDetailStub.calledOnceWithExactly({
                'id': request.id,
                'status': ORDERBOOK_STATUS.active,
                'listing_type': ORDERBOOK_TYPE.listing,
                'marketplace_id': request.marketplaceId
            })).to.be.true;
        });

        it('should return an error if the payment address does not match', async () => {
            
            const mockListing = {
                utxos: { utxo: 'c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0' },
                maker_ordinal: { address: 'tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea', public_key: 'e581edf3a948470930171a3e676490a8f7953a3698044c14b4d75ffeabc88a26' },
                maker_payment: { address: 'someOtherBTCAddress' }
            };

            // Mock successful listing retrieval
            getOrderDetailStub.resolves({ data: mockListing, error: null });

            const result = await marketplaceListing.updateListingToDeList(
                request.id,
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                request.marketplaceId
            );
            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("listing not found");

            expect(getOrderDetailStub.calledOnceWithExactly({
                'id': request.id,
                'status': ORDERBOOK_STATUS.active,
                'listing_type': ORDERBOOK_TYPE.listing,
                'marketplace_id': request.marketplaceId
            })).to.be.true;
        });
    });

    describe('#removeListingData', () => {
        const request = {
            "id": 1,
            "makerPaymentAddress": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
            "makerPaymentPublicKey": "033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c05",
            "marketplaceId": "6e210197-3d24-40da-b6a3-07f7bfdf6d32",
            "signedPSBT": "cHNidP8BAKcCAAAAApwLljDHhIUtOL+y2Ktkvphum4hesYWtEgijH82y2dCyAQAAAAD/////VLr5N0Q9buLiPY/uA0AqHvC8WAldUr62a/C0Zm7OUwMCAAAAAP////8CECcAAAAAAAAiUSDxfqROfuH4Aychb5rc57IQ98YWdvqe4KfeWrlfR6q5y1VKAAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HAAAAAAABAP1FAwIAAAAAAQQte9ILA/rTIL1T8+4YEFVmZe8Wzulvi1TnJIcofn1LUgYAAAAXFgAUpjzG2Nx2HUhFVZAI1EZ2Z/VWPdP/////MUVN7DYILNoZ3M3qjlwoDOmhbXCGDCB+x/I4iSxPoFADAAAAFxYAFKY8xtjcdh1IRVWQCNRGdmf1Vj3T/////0BzKXpfNO4i2v8tornprkrSnbLr2C3SX5yD2oWYCNfpAAAAAAD/////bsaX8LjjirpeStE/5akcsP0aDlaSOYHPc4l75OZrDm8BAAAAFxYAFKY8xtjcdh1IRVWQCNRGdmf1Vj3T/////wawBAAAAAAAABepFMHIgkQhGoD4NIyPPtLT6IzH6o4PhxAnAAAAAAAAIlEg8X6kTn7h+AMnIW+a3OeyEPfGFnb6nuCn3lq5X0equcu0BwAAAAAAABepFJIVfQukeWN75udfu7kerMT7NbE4h1gCAAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HWAIAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4dkbgAAAAAAABepFMHIgkQhGoD4NIyPPtLT6IzH6o4PhwJIMEUCIQDC6ohH1/3xS2TLdRh1U8/H6Hkp1GnNI1ngcXdllqeqiQIgRQosNscJMkHfeECvn5PQHEtPpPV8cGNgZ5cwCgr0BIMBIQKWBDOnHNbRKiltwHaz5UCnQx993WoPgRly8Eu41xfPNwJHMEQCID2k/ghAQ7IRFg72z2cvvzGTjUKYz5rD9owcu/J5vBQuAiA2FuHFvGLx/JQAQ3Aw5EP87Dp++JafsmWK7xatyBNCSgEhApYEM6cc1tEqKW3AdrPlQKdDH33dag+BGXLwS7jXF883AUGlcY5v+8A/cctgnRYtHQ8kESnZGYxHAyYBi+cNgTmdvtPwUdCX5s0XNC8mRlr2028DtgATg5+6MsKCVbbkOoXLgwJHMEQCIDQWJ+MpyoSXnn7NhK8PEpleHHdp0P7nM4c9/44dH2f2AiAVaxhrPvGzPeKOR0TTAykzaPu0HnJ8aeIpw1LT6InH4QEhApYEM6cc1tEqKW3AdrPlQKdDH33dag+BGXLwS7jXF883AAAAAAEBKxAnAAAAAAAAIlEg8X6kTn7h+AMnIW+a3OeyEPfGFnb6nuCn3lq5X0equcsBAwQBAAAAARNBD4nDMr/XYZ7+C8lotXmct4ly7muHf60Go9+uj9+eSlxJgN+gXb2FSpZXOkp0E8NxMHu5MmTwKDbrXi6Z/Dh4RwEBFyBZSkqvXaWxRND6a0eYfZZgKdiS+8SuuyMhSFPosFNwLgABAP2FAwIAAAAAAQQ4HKg2SbmmcDq7GyQRaxHqrhIHnVT/fVIT+dU5ZG1GfwUAAAAXFgAUYOWAmUUbz75xXz062hHaDeVIyzf/////OByoNkm5pnA6uxskEWsR6q4SB51U/31SE/nVOWRtRn8GAAAAFxYAFGDlgJlFG8++cV89OtoR2g3lSMs3/////zdMFrNnYky+LhMvBKF2eR4Qqj2XE9kV9my4wR9yE7dtAQAAAAD/////HyTo68Va2CUo6dBxXhlwg9HC83GNr0I4pDOBw+Q0rV4CAAAAFxYAFGDlgJlFG8++cV89OtoR2g3lSMs3/////wiwBAAAAAAAABepFJIVfQukeWN75udfu7kerMT7NbE4hxAnAAAAAAAAIlEgH4p3tAHNy4x4EssTUOx3UQXrjP7y5y9kD+8o0f28cXotTAAAAAAAABepFMHIgkQhGoD4NIyPPtLT6IzH6o4Ph1YCAAAAAAAAF6kUOW9FiIpSwM4f8g9TV2qMNvtnxheH5gMAAAAAAAAXqRR/izn+JBWDXLK0Ur6ylTpqUAgDKIdYAgAAAAAAABepFJIVfQukeWN75udfu7kerMT7NbE4h1gCAAAAAAAAF6kUkhV9C6R5Y3vm51+7uR6sxPs1sTiHX9NdAAAAAAAXqRSSFX0LpHlje+bnX7u5HqzE+zWxOIcCRzBEAiBikuGalhh/qsXx/5krVN7xUCVjPG19BWQ5FTV93H2atAIgeNEXjm1NTiOipcz1GGHLUXHHYY2F7thXJcOrkqLenfMBIQM1KNxMn9Bi5j0qjV+LLjw7gxKufB08SkGp3E7vpCBcBQJHMEQCIFbdjkJB0OXSlJke/gvILsrcdvudI5jOyErmBIkdIvoGAiAAkUeyWVwvLyl8ljyFPS/wWVL1DPjaIYgVfFqos7TLPwEhAzUo3Eyf0GLmPSqNX4suPDuDEq58HTxKQancTu+kIFwFAUHkZt0Xju2CmXyrSBYtd9KZyW21xBbpk7wp/LoHMqF40Khg9l78+PfVkn4ET8BYOaTAjTM3hk09leBNLKu/twJLgwJIMEUCIQDA/IYX7frX1dWfSyOvJDY9lJtdtsZI9JTptGwmQwnhjwIgSBp7d1BjQph9bWLDFYOyCF6I/YTVoku/CufqDjyvJ3wBIQM1KNxMn9Bi5j0qjV+LLjw7gxKufB08SkGp3E7vpCBcBQAAAAAiAgKWBDOnHNbRKiltwHaz5UCnQx993WoPgRly8Eu41xfPN0gwRQIhAIXUOh/18JoWrjqAGLL2suztBRODkuPYMIUtntAUar/ZAiBI3DEgi6VzyEP0CtiqaFfZhr5NhxOwHPmXKkzLBpw56gEBAwQBAAAAAQQWABSmPMbY3HYdSEVVkAjURnZn9VY90wAAAA=="
        };
        let broadCastPSBTStub: sinon.SinonStub;
        const txhex = '020000000001029c0b9630c784852d38bfb2d8ab64be986e9b885eb185ad1208a31fcdb2d9d0b20100000000ffffffff54baf937443d6ee2e23d8fee03402a1ef0bc58095d52beb66bf0b4666ece53030200000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff021027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cb554a00000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f8701410f89c332bfd7619efe0bc968b5799cb78972ee6b877fad06a3dfae8fdf9e4a5c4980dfa05dbd854a96573a4a7413c371307bb93264f02836eb5e2e99fc387847010248304502210085d43a1ff5f09a16ae3a8018b2f6b2eced05138392e3d830852d9ed0146abfd9022048dc31208ba573c843f40ad8aa6857d986be4d8713b01cf9972a4ccb069c39ea012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000';
        beforeEach(() => {
            broadCastPSBTStub = sinon.stub(marketplaceListing, 'broadCastPSBT');
        });

        it('should successfully delist the record', async () => {
            // Mock database operations
            getOrInsertAddressStub.resolves(1);

            // Mock data returned from findListing
            const mockListingData = {
                id: request.id,
                maker_payment_address_id: 3,
                marketplace_id: request.marketplaceId,
                maker_ordinal: { address: 'maker-ordinal-addresss'}, 
                utxos: {
                    id: 1,
                    utxo: "some-utxo-id",
                    is_spent: false
                }
            };
            getOrderDetailStub.resolves({ data: mockListingData, error: null });
            broadCastPSBTStub.resolves({ txId: 'acbf10020f7d540783ca3b5e8dac333065c17d5c8d28fbf0c73c0367b29dc082'});
            const result = await marketplaceListing.removeListingData(
                request.id,
                request.makerPaymentAddress,
                request.marketplaceId,
                request.signedPSBT
            );

            expect(getOrInsertAddressStub.calledOnceWithExactly(request.makerPaymentAddress)).to.be.true;

            expect(getOrderDetailStub.calledOnce).to.be.true;
            expect(broadCastPSBTStub.calledOnce).to.be.true;
            expect(broadCastPSBTStub.calledOnceWithExactly(txhex, [mockListingData], ORDERBOOK_STATUS.canceled, ORDERBOOK_TYPE.listing, request.makerPaymentAddress, 'maker-ordinal-addresss')).to.be.true;
            expect(result).to.deep.equal({ txId: "acbf10020f7d540783ca3b5e8dac333065c17d5c8d28fbf0c73c0367b29dc082", message: 'Record successfully delisted' });
        });

        it('should return an error if listing is not found', async () => {
            // Mock database operations
            getOrInsertAddressStub.resolves(1);

            getOrderDetailStub.resolves({ data: null, error: new Error('listing not found') });
            const result = await marketplaceListing.removeListingData(
                request.id,
                request.makerPaymentAddress,
                request.marketplaceId,
                request.signedPSBT
            );
            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("listing not found");

            expect(getOrInsertAddressStub.calledOnceWithExactly(request.makerPaymentAddress)).to.be.true;

            expect(getOrderDetailStub.calledOnce).to.be.true;;
            expect(updateOrderbookByIdsStub.notCalled).to.be.true;
        });
    });

    describe('#createTransferPSBT', () => {
        const request = {
            "transfer": [
                {
                    "ordinalId": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32bi0",
                    "receiverOrdinalAddress": "tb1p79l2gnn7u8uqxfepd7ddeeajzrmuv9nkl20wpf77t2u473a2h89s483yk3"
                },
                {
                    "ordinalId": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340i0",
                    "receiverOrdinalAddress": "tb1p79l2gnn7u8uqxfepd7ddeeajzrmuv9nkl20wpf77t2u473a2h89s483yk3"
                }
            ],
            "makerPaymentAddress": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
            "makerPaymentPublicKey": "033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c05",
            "makerOrdinalPublicKey": "e581edf3a948470930171a3e676490a8f7953a3698044c14b4d75ffeabc88a26",
            "feeRate": 28
        };
    
        let findSpecialRangesUtxosStub: sinon.SinonStub;
        beforeEach(() => {
            findSpecialRangesUtxosStub = sinon.stub(satScanner, 'findSpecialRangesUtxos');
        });

        it('should create psbt for transfer ordinals', async () => {
            getPlatformFeeAddressStub.resolves({
                id: 2,
                address: "2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx",
                public_key: null
            });

            getInscriptionInfoByIdStub
                .onFirstCall().resolves({
                    "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
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
                    "value": 546,
                    "output": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0",
                    "location": "c91f5ca101a96f69f454f216b5a7723f1fbf8e25501181f7eb4f07deccacb32b:0:0",
                })
                .onSecondCall().resolves({
                    "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
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
                    "value": 546,
                    "output": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0",
                    "location": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0:0"
                });

            getRawTxHexStub
                .onFirstCall().resolves("02000000000101dd98da8353e67a4123555adc89badb3272ece600bc93f788a8f13b5364f0892e0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a0340eb4223613e2efcb135f51212bb757ef12acf54b5d0eb0b732470149b3605be889e760f99b6cd0c9a4acb9ad9b86ac273f0ec28e9d0e8fd09f7a6d722de9d62af4a208a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e0494ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436376821c08a7637f5195ca5cd0364014d6ce2c161449e5107d6cf99153bd32538944e049400000000")
                .onSecondCall().resolves("020000000001016f1ec96bc96dddea096d41240f38a55362cb1910adbcf76e44c2a3c537e1f53d0000000000fdffffff0122020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a03407967acada7739e063621f9f8536324d9a9c73a4aa280f9ecd86c98f70a0c5ea609afc638b26a97282f9e484e37ce6dee822c1044d8264a069e293705f2b025c84a20e13e2d9eb10f08d78d983dea0bb4d3a6112aa32b93de49b8a3d400a2bb7f1611ac0063036f7264010118746578742f706c61696e3b636861727365743d7574662d3800044f3436316821c1e13e2d9eb10f08d78d983dea0bb4d3a6112aa32b93de49b8a3d400a2bb7f161100000000");

            getAddressUtxosStub.resolves([
                {
                    "txid": "f913c23bb05684212c72c2d48dc70accf6f4ab01a7eae3312a530e3062a9acd9",
                    "vout": 2,
                    "status": {
                        "confirmed": true,
                        "block_height": 2810605,
                        "block_hash": "00000000000000c50ec4f5b09e1c35d38a616d19356d012eb6e18a21046f621d",
                        "block_time": 1714623863
                    },
                    "value": 70000,
                },
            ])
            

            getOutputStub.resolves({
                    "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": {},
                    "sat_ranges": [
                        [
                            1484440221355058,
                            1484440221357980
                        ]
                    ],
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "f913c23bb05684212c72c2d48dc70accf6f4ab01a7eae3312a530e3062a9acd9",
                    "value": 2922
            });

            findSpecialRangesUtxosStub.resolves([]);

            getRawTxHexStub
                .onThirdCall().resolves("02000000000104efc613f3fc8bdf1b2111e451109b97d690faa5711a1fa0d34a18336adc56620c0100000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffb65fa3667e285f3ff2b0890509bfa5ed04e9d2d2b899f3859d028d93806f23a60300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffbbeec67231eb6ca57427996f369721c8af8b36b1ed2499bbc96bda1a48d8f8a80000000000ffffffff94c69b764cd81dc497daedf703eacab3fbe2f3e0c8eec9cd109e63ab518a6e2c0000000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff06b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cb6a0b00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f879c5f0e000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f8702483045022100e7450c6785f6818b547197a28ce5fe357f155e80fc21cb0228b165c953fa7a7f02202af70df4ad2245bed82e74d12cc9ffc708e0dda9c1e837105a9beabf34e81a1e012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf37024830450221008a04e72ce54db9f703dc63000d43873d9a61b212ac6a7faeac36d364f3b7253702207f28f0560b22171527bce52de28e4a0d0156d16aa36bd2f6d4f9ec83ec2695ca012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf37014141e25c0a0dfceadd6106b71d1b5e89f59672acd498a9e9b88aff18b1e9343cc99644bf4c9d6767dd5af87249a9dccef053c1933af723e65c358b518bd92daebc8302473044022037cbca45e109c4c3ad4932f47a7d11e3292ede6d760e143d874426daf3e22f8a02206b33dcf3daf151500fa6356363607b0982374afa7a633e9756aff1975c3c72bb012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000");

            const result = await marketplaceListing.createTransferPSBT(
                request.transfer,
                request.makerPaymentAddress,
                request.makerPaymentPublicKey,
                request.makerOrdinalPublicKey,
                request.feeRate,
            );

            expect(result).to.be.an('object');
            expect(result).to.deep.equal({
                psbtBase64: 'cHNidP8BAP0bAQIAAAADK7OszN4HT+v3gRFQJY6/Hz9yp7UW8lT0aW+pAaFcH8kAAAAAAP////9Acyl6XzTuItr/LaK56a5K0p2y69gt0l+cg9qFmAjX6QAAAAAA/////9msqWIwDlMqMePqpwGr9PbMCseN1MJyLCGEVrA7whP5AgAAAAD/////BCICAAAAAAAAIlEg8X6kTn7h+AMnIW+a3OeyEPfGFnb6nuCn3lq5X0equcsiAgAAAAAAACJRIPF+pE5+4fgDJyFvmtznshD3xhZ2+p7gp95auV9HqrnLhxMAAAAAAAAXqRQ5b0WIilLAzh/yD1NXaow2+2fGF4f10AAAAAAAABepFJIVfQukeWN75udfu7kerMT7NbE4hwAAAAAAAQErIgIAAAAAAAAiUSAfine0Ac3LjHgSyxNQ7HdRBeuM/vLnL2QP7yjR/bxxegEDBAEAAAABFyDlge3zqUhHCTAXGj5nZJCo95U6NpgETBS011/+q8iKJgABASsiAgAAAAAAACJRIB+Kd7QBzcuMeBLLE1Dsd1EF64z+8ucvZA/vKNH9vHF6AQMEAQAAAAEXIOWB7fOpSEcJMBcaPmdkkKj3lTo2mARMFLTXX/6ryIomAAEA/UYDAgAAAAABBO/GE/P8i98bIRHkURCbl9aQ+qVxGh+g00oYM2rcVmIMAQAAABcWABSmPMbY3HYdSEVVkAjURnZn9VY90/////+2X6NmfihfP/KwiQUJv6XtBOnS0riZ84WdAo2TgG8jpgMAAAAXFgAUpjzG2Nx2HUhFVZAI1EZ2Z/VWPdP/////u+7GcjHrbKV0J5lvNpchyK+LNrHtJJm7yWvaGkjY+KgAAAAAAP////+Uxpt2TNgdxJfa7fcD6sqz++Lz4Mjuyc0QnmOrUYpuLAAAAAAXFgAUpjzG2Nx2HUhFVZAI1EZ2Z/VWPdP/////BrAEAAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HECcAAAAAAAAiUSDxfqROfuH4Aychb5rc57IQ98YWdvqe4KfeWrlfR6q5y2oLAAAAAAAAF6kUkhV9C6R5Y3vm51+7uR6sxPs1sTiHWAIAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4dYAgAAAAAAABepFMHIgkQhGoD4NIyPPtLT6IzH6o4Ph5xfDgAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HAkgwRQIhAOdFDGeF9oGLVHGXoozl/jV/FV6A/CHLAiixZclT+np/AiAq9w30rSJFvtgudNEsyf/HCODdqcHoNxBam+q/NOgaHgEhApYEM6cc1tEqKW3AdrPlQKdDH33dag+BGXLwS7jXF883AkgwRQIhAIoE5yzlTbn3A9xjAA1Dhz2aYbISrGp/rqw202TztyU3AiB/KPBWCyIXFSe85S3ijkoNAVbRaqNr0vbU+eyD7CaVygEhApYEM6cc1tEqKW3AdrPlQKdDH33dag+BGXLwS7jXF883AUFB4lwKDfzq3WEGtx0bXon1lnKs1Jip6biK/xix6TQ8yZZEv0ydZ2fdWvhySanczvBTwZM69yPmXDWLUYvZLa68gwJHMEQCIDfLykXhCcTDrUky9Hp9EeMpLt5tdg4UPYdEJtrz4i+KAiBrM9zz2vFRUA+mNWNjYHsJgjdK+npjPpdWr/GXXDxyuwEhApYEM6cc1tEqKW3AdrPlQKdDH33dag+BGXLwS7jXF883AAAAAAEBIGoLAAAAAAAAF6kUkhV9C6R5Y3vm51+7uR6sxPs1sTiHAQMEAQAAAAEEFgAUYOWAmUUbz75xXz062hHaDeVIyzcAAAAAAA==',
                makerOrdinalInputIndices: [0, 1],
                makerPaymentInputIndices: [2],
            });
            expect(getPlatformFeeAddressStub.calledOnce).to.be.true;
            expect(getInscriptionInfoByIdStub.callCount).to.equal(2);
            expect(getRawTxHexStub.callCount).to.equal(3);
            expect(getAddressUtxosStub.calledOnce).to.be.true;
            expect(getOutputStub.calledOnce).to.be.true;
        });
    });

    describe('#createTakerPSBT', () => {
        const request = {
            "id": 1,
            "takerPaymentAddress": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
            "takerPaymentPublicKey": "033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c05",
            "takerOrdinalAddress": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
            "marketplaceId": "6e210197-3d24-40da-b6a3-07f7bfdf6d32",
            "feeRate": 28
        };

        let findSpecialRangesUtxosStub: sinon.SinonStub;
        let getWalletTrioBalanceStub: sinon.SinonStub;
        let getTransactionStub: sinon.SinonStub;
        let getNonTradableCollectionsStub: sinon.SinonStub;
        let getActiveOrBroadcastOrderbooksStub: sinon.SinonStub;
        let enterInitiatedStateStub: sinon.SinonStub;

        const takerPaymentAddressId = 3;
        const takerOrdinalAddressId = 4;
        beforeEach(() => {
            findSpecialRangesUtxosStub = sinon.stub(satScanner, 'findSpecialRangesUtxos');
            getWalletTrioBalanceStub = sinon.stub(opi, 'getWalletTrioBalance');
            getTransactionStub = sinon.stub(esplora, 'getTransaction');
            getNonTradableCollectionsStub = sinon.stub(supabase, 'getNonTradableCollectionsByOrderIds').resolves([]);
            getActiveOrBroadcastOrderbooksStub = sinon.stub(supabase, 'getActiveOrBroadcastOrderbooks');
            enterInitiatedStateStub = sinon.stub(supabase, 'enterInitiatedState');
        });

        it('should return an error if restricted inscriptions exist on order', async () => {
            getNonTradableCollectionsStub.reset();
            getNonTradableCollectionsStub.resolves([
                {
                    slug: 'inners',
                    inscription_id: 'adbc',
                }
            ]);

            const result = await marketplaceListing.createTakerPSBT([request.id], request.takerPaymentAddress, request.takerPaymentPublicKey, request.takerOrdinalAddress, request.marketplaceId, request.feeRate);

            expect(result).to.be.an('object');
            expect(result).to.deep.equal({ error: 'utxo contains inscriptions which are not tradable' });
            expect(getNonTradableCollectionsStub.calledOnce).to.be.true;
            expect(getNonTradableCollectionsStub.calledWith([request.id])).to.be.true;
        });

        it('should return a PSBT if all operations succeed', async () => {
            // Simulate order data
            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: request.id,
                    price: 1000,
                    status: 'active',
                    platform_maker_fee: 100,
                    platform_taker_fee: 100,
                    marketplace_taker_fee: 0,
                    marketplace_maker_fee: 499,
                    maker_output_value: 2000,
                    utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                    maker_payment: { address: request.takerPaymentAddress },
                    platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                    marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                    maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" }
                }],
                error: null
            });

            getOrInsertAddressStub
                .onFirstCall().resolves(takerOrdinalAddressId)
                .onSecondCall().resolves(takerPaymentAddressId);
            
            getWalletTrioBalanceStub.resolves(0);
            getOutputStub.resolves({ value: 546 });

            getAddressUtxosStub.onFirstCall().resolves([
                {
                    "txid": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                    "vout": 2,
                    "status": {
                        "confirmed": true,
                        "block_height": 2810336,
                        "block_hash": "00000000000000c350cec25179001f1258f7bb45c4702de739cef8ae28e23749",
                        "block_time": 1714564755
                    },
                    "value": 600
                },
                {
                    "txid": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                    "vout": 0,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081551,
                        "block_hash": "000000000000002cf9e6f5d7197e59ac61224464d65ae4abeb90f6f1df21ef20",
                        "block_time": 1728388358
                    },
                    "value": 600
                },
                {
                    "txid": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "vout": 7,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081570,
                        "block_hash": "00000000729177c2581376ebf3239d7acba5ef0ba8d4c599fc26ac7b4d2de2eb",
                        "block_time": 1728393244
                    },
                    "value": 7221526
                }
            ]);

            getRawTxHexStub
                .onCall(0).resolves("02000000000104f24ec8ec29b9e052312629076ea37b663f114c7c677acaf95aac0620e7b8efac0100000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffeb581fbf5ea282d4a2208b96a4b88ecddb8de2e2699edae683ca0e671603c52b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff2794df22847bc57d32c56ce61b836b0a3f76359650924ff6ae3004154062b5a80000000000ffffffff2b48e1ab76cafda6e8dfb25a7dc802e53ab479b8d862f3076dff5a30207abbc80000000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff06b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cb200f00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87cc8306000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87024730440220755b78633be6d5806a3ce54e962afa22af2237af2a1aaefde64178b98648a66d022012847fe2c8d3c24047ba866f7d129113dba856944bf6e8356ced6fd96fae9b0b012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370247304402203b04e369dcf01f624ee4b058b94eb8e16a04cff75fed13e38a5b2a5c128e4ad8022076ba844007f28da84af58fee8b8ac2417100d43c676d038c6d1947129c68ceb3012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3701419e8c84bfd835eb022d76d9e1ff79e4a0a2e706140fbc36878ed2a00091a240bf08acc9384336148aa9e9d58d2ea229830f3dd253ef809bde6935c548fcab8bbd8302483045022100c7c9ddd99268e3fe5ea51a547e4a99e12630e404bc1544bb650a67c19f77680a02205f9f00be366daaadd0c3a48b2176843b6ffa6f44468baaa26ce995d8515a7df5012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000")
                .onCall(1).resolves("020000000001041ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff26ba4e2d2984241f55dd74d97734f1e409287d8477bb9329e1b107e757c69b4e0000000000ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2070000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388722020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a5d3300000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87450300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787750500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b138873a1c51000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887024730440220203b3447fc5019dcafa8aed40ee4e6b7fb9b3de720d4f12e208d7562d997f9e902201566e18cb7e65672a28f8c37225420779cef88c593a9c0b95fedbd17bb3996cb0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0502483045022100c9b94c57dad07e943473c340fbd318577a21b401bb09d700da9690b03e380b270220133bd41a90c86fdfa2767e130071b5df1782a78c089340bd7ad572508a9588010121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501415c875f09cb5cd1413f75b1579abb058e9f3caaeee1962d57e81c1c80dba34b29522e84991c5d0740d9d5986e86d96741a524e65dfe9cc4209179a93e8adbeef8830247304402206c0c8bdae511d2df7db45a0e2caab4f9425ab68db56c3435d8ab1ce35331b1c9022050f9e7a2e2a77400f3de5019eedb6d0586f523494a60cb6b9f66402f0b3206900121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000")
                .onCall(2).resolves("02000000000104b93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffbb9761229af55fd9b4d1d5090854947423831c769be5d5a534cdf6bf161e20130300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff803e3b31cc97d77c71c349f8d5d260204742ae7be3944ca9e4ad51085d9afb130000000000ffffffffb93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0500000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff07b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cbc53a00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887900300000000000017a914ebbd919e2d532788ad2d4020044018db716c82d387580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87f4b30c000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f870247304402207d68a86708375d1bf85ee6afb45da630b932c6af9f0cc4a6ac0d80bec8aafc1502202915306036beff927cb8707c2386c64ab0f5a415ec777f09b970d3edb5419569012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3702483045022100ecf00430ca4821536c9289cf1693167ce65a7ae20c3338b15127d621d60ffa82022048cb9011cee21a475faa0f2f638d696710708251368b7824cf33ea6bce7e3c4e012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370141b732bee064f782b53b68b999b4a1997684bef6a3ea43eb2ae9bcb3d1a1025e296b613e45f70085770a1a2190a25a5c73170dcacab0009d46e59cf5cf832aaf3b83024730440220777644f084f9ed2f12b0ef763b0e4f6079ebb820933e2001bb484701eb4a13f10220654bf4c5b1f050dd78b6bb505d9a43d8a04c04f1a4860de8310d77c9e184e3e0012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000");

            getOutputStub.resolves({
                    "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                    "indexed": false,
                    "inscriptions": [],
                    "runes": {},
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": true,
                    "transaction": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "value": 5221526
            });

            findSpecialRangesUtxosStub.resolves([]);

            getRawTxHexStub
                .onCall(3).resolves("0200000000010445941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8040000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffffdb877a4316a5c61e797435fb6d4fd282740f2a15a87bf8c9c95d55f35c49790d0100000000ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388710270000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a505700000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87090300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787110500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388796ac4f000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388702483045022100bc813611265bf0e501e9b0d3d5838b0a02ad6482e610c6f4c53651bf642eee84022060ae67207ef75ad22007c06525d0f08a1b443e85ae65fbe5d87ed2609a56084c0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050247304402201f6c26c3e82611caa8533cf5abbc1e579206fecb3916008d088a2b911b8cf7620220752652de5bdb041515a55c45097e6fee3b9d29c82f94565b8a06190cf60300610121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501411cb12ebe916ecaa98b80ed0bbe3b766aa738f12cf3889f40af38c1079c7fa306103fbfe282fe13e408c4c4dc8a3542cfa6eabae953c1db6f698b4b07477de1bb8302483045022100b83bc3c89ffa1fdfbfa19c6f7e7369723fe80aedd9086c0f2788092f8362222c02203bd6c7511c8b796d9fa8c022639577d1a94d3174620a47c13ed96174f4c86a720121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000");

            enterInitiatedStateStub.resolves({ data: [], error: null});
            const result = await marketplaceListing.createTakerPSBT(
                [request.id],
                request.takerPaymentAddress,
                request.takerPaymentPublicKey,
                request.takerOrdinalAddress,
                request.marketplaceId,
                request.feeRate
            );

            expect(result).to.have.property('psbt');
            expect(result.psbt).to.be.an('string');
            expect(result).to.have.property('inputIndices');
            expect(result.inputIndices).to.be.an('array');
            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
            
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.takerOrdinalAddress);
            expect(getOrInsertAddressStub.secondCall.args[0]).to.deep.equal(request.takerPaymentAddress,request.takerPaymentPublicKey);
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1");
            expect(getAddressUtxosStub.callCount).to.equal(1);
            expect(getRawTxHexStub.callCount).to.equal(4);
            // 4th call will be this, as 2nd and 3rd call are for dummy utxos
            expect(getOutputStub.args[3][0]).to.deep.equal("12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc:7");
            expect(enterInitiatedStateStub.calledOnceWithExactly(
                [
                    {
                        order_id: 1,
                        marketplace_taker_fee_collected_bips: 0,
                        marketplace_fee_collected_sats: 546,
                        platform_taker_fee_collected_bips: 100,
                        platfrom_fee_collected_sats: 546
                    }
                ],
                takerPaymentAddressId,
                takerOrdinalAddressId,
                ORDERBOOK_STATUS.pending_taker_confirmation,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });
        
        it('should return a PSBT if all operations succeed for broadcasted orderbook', async () => {
            // Simulate order data
            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: request.id,
                    price: 1000,
                    status: 'broadcast',
                    platform_maker_fee: 100,
                    platform_taker_fee: 100,
                    marketplace_taker_fee: 0,
                    marketplace_maker_fee: 499,
                    maker_output_value: 2000,
                    utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                    maker_payment: { address: request.takerPaymentAddress },
                    platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                    marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                    maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" },
                    trade_history: [{
                        status: 'mempool',
                        fee_rate: 10
                    },{
                        status: 'mempool',
                        fee_rate: 15
                    }]
                }],
                error: null
            });

            getOrInsertAddressStub
                .onFirstCall().resolves(takerOrdinalAddressId)
                .onSecondCall().resolves(takerPaymentAddressId);

            getOutputStub.resolves({ value: 546 });

            getAddressUtxosStub.onFirstCall().resolves([
                {
                    "txid": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                    "vout": 2,
                    "status": {
                        "confirmed": true,
                        "block_height": 2810336,
                        "block_hash": "00000000000000c350cec25179001f1258f7bb45c4702de739cef8ae28e23749",
                        "block_time": 1714564755
                    },
                    "value": 600
                },
                {
                    "txid": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                    "vout": 0,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081551,
                        "block_hash": "000000000000002cf9e6f5d7197e59ac61224464d65ae4abeb90f6f1df21ef20",
                        "block_time": 1728388358
                    },
                    "value": 600
                },
                {
                    "txid": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "vout": 7,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081570,
                        "block_hash": "00000000729177c2581376ebf3239d7acba5ef0ba8d4c599fc26ac7b4d2de2eb",
                        "block_time": 1728393244
                    },
                    "value": 7221526
                }
            ]);

            getRawTxHexStub
                .onCall(0).resolves("02000000000104f24ec8ec29b9e052312629076ea37b663f114c7c677acaf95aac0620e7b8efac0100000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffeb581fbf5ea282d4a2208b96a4b88ecddb8de2e2699edae683ca0e671603c52b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff2794df22847bc57d32c56ce61b836b0a3f76359650924ff6ae3004154062b5a80000000000ffffffff2b48e1ab76cafda6e8dfb25a7dc802e53ab479b8d862f3076dff5a30207abbc80000000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff06b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cb200f00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87cc8306000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87024730440220755b78633be6d5806a3ce54e962afa22af2237af2a1aaefde64178b98648a66d022012847fe2c8d3c24047ba866f7d129113dba856944bf6e8356ced6fd96fae9b0b012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370247304402203b04e369dcf01f624ee4b058b94eb8e16a04cff75fed13e38a5b2a5c128e4ad8022076ba844007f28da84af58fee8b8ac2417100d43c676d038c6d1947129c68ceb3012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3701419e8c84bfd835eb022d76d9e1ff79e4a0a2e706140fbc36878ed2a00091a240bf08acc9384336148aa9e9d58d2ea229830f3dd253ef809bde6935c548fcab8bbd8302483045022100c7c9ddd99268e3fe5ea51a547e4a99e12630e404bc1544bb650a67c19f77680a02205f9f00be366daaadd0c3a48b2176843b6ffa6f44468baaa26ce995d8515a7df5012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000")
                .onCall(1).resolves("020000000001041ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff26ba4e2d2984241f55dd74d97734f1e409287d8477bb9329e1b107e757c69b4e0000000000ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2070000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388722020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a5d3300000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87450300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787750500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b138873a1c51000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887024730440220203b3447fc5019dcafa8aed40ee4e6b7fb9b3de720d4f12e208d7562d997f9e902201566e18cb7e65672a28f8c37225420779cef88c593a9c0b95fedbd17bb3996cb0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0502483045022100c9b94c57dad07e943473c340fbd318577a21b401bb09d700da9690b03e380b270220133bd41a90c86fdfa2767e130071b5df1782a78c089340bd7ad572508a9588010121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501415c875f09cb5cd1413f75b1579abb058e9f3caaeee1962d57e81c1c80dba34b29522e84991c5d0740d9d5986e86d96741a524e65dfe9cc4209179a93e8adbeef8830247304402206c0c8bdae511d2df7db45a0e2caab4f9425ab68db56c3435d8ab1ce35331b1c9022050f9e7a2e2a77400f3de5019eedb6d0586f523494a60cb6b9f66402f0b3206900121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000")
                .onCall(2).resolves("02000000000104b93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffbb9761229af55fd9b4d1d5090854947423831c769be5d5a534cdf6bf161e20130300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff803e3b31cc97d77c71c349f8d5d260204742ae7be3944ca9e4ad51085d9afb130000000000ffffffffb93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0500000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff07b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cbc53a00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887900300000000000017a914ebbd919e2d532788ad2d4020044018db716c82d387580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87f4b30c000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f870247304402207d68a86708375d1bf85ee6afb45da630b932c6af9f0cc4a6ac0d80bec8aafc1502202915306036beff927cb8707c2386c64ab0f5a415ec777f09b970d3edb5419569012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3702483045022100ecf00430ca4821536c9289cf1693167ce65a7ae20c3338b15127d621d60ffa82022048cb9011cee21a475faa0f2f638d696710708251368b7824cf33ea6bce7e3c4e012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370141b732bee064f782b53b68b999b4a1997684bef6a3ea43eb2ae9bcb3d1a1025e296b613e45f70085770a1a2190a25a5c73170dcacab0009d46e59cf5cf832aaf3b83024730440220777644f084f9ed2f12b0ef763b0e4f6079ebb820933e2001bb484701eb4a13f10220654bf4c5b1f050dd78b6bb505d9a43d8a04c04f1a4860de8310d77c9e184e3e0012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000");

            getOutputStub.resolves({
                    "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                    "indexed": false,
                    "inscriptions": [],
                    "runes": {},
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": true,
                    "transaction": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "value": 5221526
            });

            findSpecialRangesUtxosStub.resolves([]);
            getWalletTrioBalanceStub.resolves(0);

            getRawTxHexStub
                .onCall(3).resolves("0200000000010445941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8040000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffffdb877a4316a5c61e797435fb6d4fd282740f2a15a87bf8c9c95d55f35c49790d0100000000ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388710270000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a505700000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87090300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787110500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388796ac4f000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388702483045022100bc813611265bf0e501e9b0d3d5838b0a02ad6482e610c6f4c53651bf642eee84022060ae67207ef75ad22007c06525d0f08a1b443e85ae65fbe5d87ed2609a56084c0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050247304402201f6c26c3e82611caa8533cf5abbc1e579206fecb3916008d088a2b911b8cf7620220752652de5bdb041515a55c45097e6fee3b9d29c82f94565b8a06190cf60300610121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501411cb12ebe916ecaa98b80ed0bbe3b766aa738f12cf3889f40af38c1079c7fa306103fbfe282fe13e408c4c4dc8a3542cfa6eabae953c1db6f698b4b07477de1bb8302483045022100b83bc3c89ffa1fdfbfa19c6f7e7369723fe80aedd9086c0f2788092f8362222c02203bd6c7511c8b796d9fa8c022639577d1a94d3174620a47c13ed96174f4c86a720121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000");
            
            enterInitiatedStateStub.resolves({ data: [], error: null});

            const result = await marketplaceListing.createTakerPSBT(
                [request.id],
                request.takerPaymentAddress,
                request.takerPaymentPublicKey,
                request.takerOrdinalAddress,
                request.marketplaceId,
                request.feeRate
            );

            expect(result).to.have.property('psbt');
            expect(result.psbt).to.be.an('string');
            expect(result).to.have.property('inputIndices');
            expect(result.inputIndices).to.be.an('array');
            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.takerOrdinalAddress);
            expect(getOrInsertAddressStub.secondCall.args[0]).to.deep.equal(request.takerPaymentAddress,request.takerPaymentPublicKey);
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1");
            expect(getAddressUtxosStub.callCount).to.equal(1);
            expect(getRawTxHexStub.callCount).to.equal(4);
            // 4th call will be this, as 2nd and 3rd call are for dummy utxos
            expect(getOutputStub.args[3][0]).to.deep.equal("12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc:7");
            expect(enterInitiatedStateStub.calledOnceWithExactly(
                [
                    {
                        order_id: 1,
                        marketplace_taker_fee_collected_bips: 0,
                        marketplace_fee_collected_sats: 546,
                        platform_taker_fee_collected_bips: 100,
                        platfrom_fee_collected_sats: 546
                    }
                ],
                takerPaymentAddressId,
                takerOrdinalAddressId,
                ORDERBOOK_STATUS.pending_taker_confirmation,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });

        it('Should return an error if confirmed UTXOs are insufficient to cover the snipe order transaction amount', async () => {
            // Simulate order data
            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: request.id,
                    price: 1000,
                    status: 'broadcast',
                    platform_maker_fee: 100,
                    platform_taker_fee: 100,
                    marketplace_taker_fee: 0,
                    marketplace_maker_fee: 499,
                    maker_output_value: 2000,
                    utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                    maker_payment: { address: request.takerPaymentAddress },
                    platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                    marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                    maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" },
                    trade_history: [{
                        status: 'mempool',
                        fee_rate: 10
                    },{
                        status: 'mempool',
                        fee_rate: 15
                    }]
                }],
                error: null
            });

            getOrInsertAddressStub.onFirstCall().resolves({ id: 3, address: request.takerOrdinalAddress });

            getOutputStub.resolves({ value: 546 });

            getAddressUtxosStub.onFirstCall().resolves([
                {
                    "txid": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                    "vout": 2,
                    "status": {
                        "confirmed": true,
                        "block_height": 2810336,
                        "block_hash": "00000000000000c350cec25179001f1258f7bb45c4702de739cef8ae28e23749",
                        "block_time": 1714564755
                    },
                    "value": 600
                },
                {
                    "txid": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                    "vout": 0,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081551,
                        "block_hash": "000000000000002cf9e6f5d7197e59ac61224464d65ae4abeb90f6f1df21ef20",
                        "block_time": 1728388358
                    },
                    "value": 600
                },
                {
                    "txid": "some-tx-id",
                    "vout": 7,
                    "status": {
                        "confirmed": false,
                        "block_height": 3081570,
                        "block_hash": "some-block-hash",
                        "block_time": 1728393244
                    },
                    "value": 5220000
                },
                {
                    "txid": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "vout": 7,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081570,
                        "block_hash": "00000000729177c2581376ebf3239d7acba5ef0ba8d4c599fc26ac7b4d2de2eb",
                        "block_time": 1728393244
                    },
                    "value": 5220000
                }
            ]);

            getOutputStub.resolves({
                    "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                    "indexed": false,
                    "inscriptions": [],
                    "runes": {},
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": true,
                    "transaction": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "value": 5221526
            });

            getRawTxHexStub.onFirstCall().resolves("02000000000104f24ec8ec29b9e052312629076ea37b663f114c7c677acaf95aac0620e7b8efac0100000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffeb581fbf5ea282d4a2208b96a4b88ecddb8de2e2699edae683ca0e671603c52b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff2794df22847bc57d32c56ce61b836b0a3f76359650924ff6ae3004154062b5a80000000000ffffffff2b48e1ab76cafda6e8dfb25a7dc802e53ab479b8d862f3076dff5a30207abbc80000000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff06b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cb200f00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87cc8306000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87024730440220755b78633be6d5806a3ce54e962afa22af2237af2a1aaefde64178b98648a66d022012847fe2c8d3c24047ba866f7d129113dba856944bf6e8356ced6fd96fae9b0b012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370247304402203b04e369dcf01f624ee4b058b94eb8e16a04cff75fed13e38a5b2a5c128e4ad8022076ba844007f28da84af58fee8b8ac2417100d43c676d038c6d1947129c68ceb3012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3701419e8c84bfd835eb022d76d9e1ff79e4a0a2e706140fbc36878ed2a00091a240bf08acc9384336148aa9e9d58d2ea229830f3dd253ef809bde6935c548fcab8bbd8302483045022100c7c9ddd99268e3fe5ea51a547e4a99e12630e404bc1544bb650a67c19f77680a02205f9f00be366daaadd0c3a48b2176843b6ffa6f44468baaa26ce995d8515a7df5012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000");
            findSpecialRangesUtxosStub.resolves([]);
            getWalletTrioBalanceStub.resolves(0);

            getRawTxHexStub
                .onCall(3).resolves("0200000000010445941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8040000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffffdb877a4316a5c61e797435fb6d4fd282740f2a15a87bf8c9c95d55f35c49790d0100000000ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388710270000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a505700000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87090300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787110500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388796ac4f000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388702483045022100bc813611265bf0e501e9b0d3d5838b0a02ad6482e610c6f4c53651bf642eee84022060ae67207ef75ad22007c06525d0f08a1b443e85ae65fbe5d87ed2609a56084c0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050247304402201f6c26c3e82611caa8533cf5abbc1e579206fecb3916008d088a2b911b8cf7620220752652de5bdb041515a55c45097e6fee3b9d29c82f94565b8a06190cf60300610121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501411cb12ebe916ecaa98b80ed0bbe3b766aa738f12cf3889f40af38c1079c7fa306103fbfe282fe13e408c4c4dc8a3542cfa6eabae953c1db6f698b4b07477de1bb8302483045022100b83bc3c89ffa1fdfbfa19c6f7e7369723fe80aedd9086c0f2788092f8362222c02203bd6c7511c8b796d9fa8c022639577d1a94d3174620a47c13ed96174f4c86a720121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000");
            const result = await marketplaceListing.createTakerPSBT(
                [request.id],
                request.takerPaymentAddress,
                request.takerPaymentPublicKey,
                request.takerOrdinalAddress,
                request.marketplaceId,
                request.feeRate
            );

            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("Not enough cardinal spendable funds. Address has:  5220000 sats Needed:       5227018 sats");
            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.takerOrdinalAddress);
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1");
            expect(getAddressUtxosStub.callCount).to.equal(1);
            expect(getRawTxHexStub.callCount).to.equal(1);
            // 4th call will be this, as 2nd and 3rd call are for dummy utxos
            expect(getOutputStub.args[3][0]).to.deep.equal("12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc:7");
        });
        
        it('should return a error if orderbook is broadcast and is already confirmed', async () => {
            // Simulate order data
            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: request.id,
                    price: 1000,
                    status: 'broadcast',
                    platform_maker_fee: 100,
                    platform_taker_fee: 100,
                    marketplace_taker_fee: 0,
                    marketplace_maker_fee: 499,
                    maker_output_value: 2000,
                    utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                    maker_payment: { address: request.takerPaymentAddress },
                    platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                    marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                    maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" },
                    trade_history: [{
                        status: 'mempool',
                        fee_rate: 10
                    },{
                        status: 'confirmed',
                        fee_rate: 15
                    }]
                }],
                error: null
            });

            const result = await marketplaceListing.createTakerPSBT(
                [request.id],
                request.takerPaymentAddress,
                request.takerPaymentPublicKey,
                request.takerOrdinalAddress,
                request.marketplaceId,
                request.feeRate
            );

            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("order already confirmed");
            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });

        it('should return a error invalid orderbook ids', async () => {
            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: request.id,
                    price: 1000,
                    status: 'broadcast',
                    platform_maker_fee: 100,
                    platform_taker_fee: 100,
                    marketplace_taker_fee: 0,
                    marketplace_maker_fee: 499,
                    maker_output_value: 2000,
                    utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                    maker_payment: { address: request.takerPaymentAddress },
                    platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                    marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                    maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" },
                    trade_history: [{
                        status: 'mempool',
                        fee_rate: 10
                    }]
                }],
                error: null
            });

            const result = await marketplaceListing.createTakerPSBT(
                [request.id, 23, 24],
                request.takerPaymentAddress,
                request.takerPaymentPublicKey,
                request.takerOrdinalAddress,
                request.marketplaceId,
                request.feeRate
            );

            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("Order IDs 23, 24 are not found");
            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id, 23, 24],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });
        
        it('should return a error invalid orderbook id', async () => {
            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: request.id,
                    price: 1000,
                    status: 'broadcast',
                    platform_maker_fee: 100,
                    platform_taker_fee: 100,
                    marketplace_taker_fee: 0,
                    marketplace_maker_fee: 499,
                    maker_output_value: 2000,
                    utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                    maker_payment: { address: request.takerPaymentAddress },
                    platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                    marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                    maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" },
                    trade_history: [{
                        status: 'mempool',
                        fee_rate: 10
                    }]
                }],
                error: null
            });

            const result = await marketplaceListing.createTakerPSBT(
                [request.id, 23],
                request.takerPaymentAddress,
                request.takerPaymentPublicKey,
                request.takerOrdinalAddress,
                request.marketplaceId,
                request.feeRate
            );

            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("Order ID 23 is not found");
            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id, 23],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });

        it('it should return an error if the fee rate is not greater than the existing fee rates.', async () => {

            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: request.id,
                    price: 1000,
                    platform_maker_fee: 100,
                    platform_taker_fee: 100,
                    marketplace_taker_fee: 0,
                    marketplace_maker_fee: 499,
                    maker_output_value: 2000,
                    utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                    maker_payment: { address: request.takerPaymentAddress },
                    platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                    marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                    maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" },
                    status: 'broadcast',
                    batch_id: 1,
                    trade_history: [
                        {
                            id: 1,
                            status: 'mempool',
                            fee_rate: 28,
                            order_id: 1,
                            transaction_id: 'xxxx--xxxx',
                            taker_ordinal_address_id: 7,
                            taker_payment_address_id: 6
                        }
                    ]
                }],
                error: null
            });

            // Assert that the method throws the expected error
            const result = await marketplaceListing.createTakerPSBT(
                [request.id],
                request.takerPaymentAddress,
                request.takerPaymentPublicKey,
                request.takerOrdinalAddress,
                request.marketplaceId,
                request.feeRate
            );

            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("please enter a higher fee rate for this transaction");

            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });

        it('should return an error if order is not found', async () => {

            // Mock getOrderDetails to return an error
            getActiveOrBroadcastOrderbooksStub.resolves({ data: null, error: new Error('listing not found') });

            const result = await marketplaceListing.createTakerPSBT(
                [request.id],
                request.takerPaymentAddress,
                request.takerPaymentPublicKey,
                request.takerOrdinalAddress,
                request.marketplaceId,
                request.feeRate,
            );
            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("listing not found");


            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });

        it('should throw error if UTXO is not found in ordExplorer', async () => {
            // Simulate order data
            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: 1,
                    price: 1000,
                    platform_maker_fee: 100,
                    platform_taker_fee: 100,
                    marketplace_taker_fee: 0,
                    marketplace_maker_fee: 499,
                    status: 'active',
                    utxos: { utxo: 'some-utxo' },
                    maker_payment: { address: 'makerAddress' },
                    platform_fee: { address: 'platformFee' },
                    marketplace_fee: { address: 'marketplace_fee' },
                }],
                error: null
            });
            getOrInsertAddressStub
                .onFirstCall().resolves({ id: 3, address: request.takerOrdinalAddress })
                .onSecondCall().resolves({ id: 4, address: request.takerPaymentAddress, public_key: request.takerPaymentPublicKey });
            getOutputStub.resolves(null);

            await expect(
                marketplaceListing.createTakerPSBT(
                    [request.id],
                    request.takerPaymentAddress,
                    request.takerPaymentPublicKey,
                    request.takerOrdinalAddress,
                    request.marketplaceId,
                    request.feeRate,
                )
            ).to.be.rejectedWith('Utxo value not found');
            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
            expect(getOutputStub.calledOnceWithExactly("some-utxo")).to.be.true;
        });

        it('should skip dummy utxos if they include runes', async () => {
            // Simulate order data
            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: request.id,
                    price: 1000,
                    status: 'active',
                    platform_maker_fee: 100,
                    platform_taker_fee: 100,
                    marketplace_taker_fee: 0,
                    marketplace_maker_fee: 499,
                    maker_output_value: 2000,
                    utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                    maker_payment: { address: request.takerPaymentAddress },
                    platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                    marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                    maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" }
                }],
                error: null
            });

            getOrInsertAddressStub
                .onFirstCall().resolves(takerOrdinalAddressId)
                .onSecondCall().resolves(takerPaymentAddressId);
            
            getAddressUtxosStub.onFirstCall().resolves([
                {
                    "txid": "57c75f5456c67c2cf456392e80fb989d767aa4d2d07427028fe0ec915157034e",
                    "vout": 8,
                    "status": {
                        "confirmed": true,
                        "block_height": 2810336,
                        "block_hash": "00000000000000c350cec25179001f1258f7bb45c4702de739cef8ae28e23749",
                        "block_time": 1714564755
                    },
                    "value": 600
                },
                {
                    "txid": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                    "vout": 2,
                    "status": {
                        "confirmed": true,
                        "block_height": 2810336,
                        "block_hash": "00000000000000c350cec25179001f1258f7bb45c4702de739cef8ae28e23749",
                        "block_time": 1714564755
                    },
                    "value": 600
                },
                {
                    "txid": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                    "vout": 0,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081551,
                        "block_hash": "000000000000002cf9e6f5d7197e59ac61224464d65ae4abeb90f6f1df21ef20",
                        "block_time": 1728388358
                    },
                    "value": 600
                },
                {
                    "txid": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "vout": 7,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081570,
                        "block_hash": "00000000729177c2581376ebf3239d7acba5ef0ba8d4c599fc26ac7b4d2de2eb",
                        "block_time": 1728393244
                    },
                    "value": 7221526
                }
            ]);

            getRawTxHexStub
                .onCall(0).resolves("02000000000104f24ec8ec29b9e052312629076ea37b663f114c7c677acaf95aac0620e7b8efac0100000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffeb581fbf5ea282d4a2208b96a4b88ecddb8de2e2699edae683ca0e671603c52b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff2794df22847bc57d32c56ce61b836b0a3f76359650924ff6ae3004154062b5a80000000000ffffffff2b48e1ab76cafda6e8dfb25a7dc802e53ab479b8d862f3076dff5a30207abbc80000000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff06b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cb200f00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87cc8306000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87024730440220755b78633be6d5806a3ce54e962afa22af2237af2a1aaefde64178b98648a66d022012847fe2c8d3c24047ba866f7d129113dba856944bf6e8356ced6fd96fae9b0b012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370247304402203b04e369dcf01f624ee4b058b94eb8e16a04cff75fed13e38a5b2a5c128e4ad8022076ba844007f28da84af58fee8b8ac2417100d43c676d038c6d1947129c68ceb3012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3701419e8c84bfd835eb022d76d9e1ff79e4a0a2e706140fbc36878ed2a00091a240bf08acc9384336148aa9e9d58d2ea229830f3dd253ef809bde6935c548fcab8bbd8302483045022100c7c9ddd99268e3fe5ea51a547e4a99e12630e404bc1544bb650a67c19f77680a02205f9f00be366daaadd0c3a48b2176843b6ffa6f44468baaa26ce995d8515a7df5012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000")
                .onCall(1).resolves("020000000001041ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff26ba4e2d2984241f55dd74d97734f1e409287d8477bb9329e1b107e757c69b4e0000000000ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2070000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388722020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a5d3300000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87450300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787750500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b138873a1c51000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887024730440220203b3447fc5019dcafa8aed40ee4e6b7fb9b3de720d4f12e208d7562d997f9e902201566e18cb7e65672a28f8c37225420779cef88c593a9c0b95fedbd17bb3996cb0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0502483045022100c9b94c57dad07e943473c340fbd318577a21b401bb09d700da9690b03e380b270220133bd41a90c86fdfa2767e130071b5df1782a78c089340bd7ad572508a9588010121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501415c875f09cb5cd1413f75b1579abb058e9f3caaeee1962d57e81c1c80dba34b29522e84991c5d0740d9d5986e86d96741a524e65dfe9cc4209179a93e8adbeef8830247304402206c0c8bdae511d2df7db45a0e2caab4f9425ab68db56c3435d8ab1ce35331b1c9022050f9e7a2e2a77400f3de5019eedb6d0586f523494a60cb6b9f66402f0b3206900121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000")
                .onCall(2).resolves("02000000000104b93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffbb9761229af55fd9b4d1d5090854947423831c769be5d5a534cdf6bf161e20130300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff803e3b31cc97d77c71c349f8d5d260204742ae7be3944ca9e4ad51085d9afb130000000000ffffffffb93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0500000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff07b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cbc53a00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887900300000000000017a914ebbd919e2d532788ad2d4020044018db716c82d387580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87f4b30c000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f870247304402207d68a86708375d1bf85ee6afb45da630b932c6af9f0cc4a6ac0d80bec8aafc1502202915306036beff927cb8707c2386c64ab0f5a415ec777f09b970d3edb5419569012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3702483045022100ecf00430ca4821536c9289cf1693167ce65a7ae20c3338b15127d621d60ffa82022048cb9011cee21a475faa0f2f638d696710708251368b7824cf33ea6bce7e3c4e012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370141b732bee064f782b53b68b999b4a1997684bef6a3ea43eb2ae9bcb3d1a1025e296b613e45f70085770a1a2190a25a5c73170dcacab0009d46e59cf5cf832aaf3b83024730440220777644f084f9ed2f12b0ef763b0e4f6079ebb820933e2001bb484701eb4a13f10220654bf4c5b1f050dd78b6bb505d9a43d8a04c04f1a4860de8310d77c9e184e3e0012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000");

            getOutputStub.onCall(0).resolves({
                    address: "some-taproot-address",
                    indexed: true,
                    inscriptions: [],
                    runes: [],
                    sat_ranges: null,
                    script_pubkey: "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    spent: false,
                    transaction: "cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13",
                    value: 546
            })
            .onCall(1).resolves({
                    "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": [
                        [
                            "ORDINALSBOT•TESTING•RUNE1",
                            {
                                "amount": 23800,
                                "divisibility": 2,
                                "symbol": "🤖"
                            }
                        ]
                    ],
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "57c75f5456c67c2cf456392e80fb989d767aa4d2d07427028fe0ec915157034e",
                    "value": 600
            })
            .onCall(2).resolves({
                    "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": [],
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                    "value": 600
            })
            .onCall(3).resolves({
                    "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": {},
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                    "value": 600
            })
            .onCall(4).resolves({
                    "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": {},
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "value": 5221526
            });

            findSpecialRangesUtxosStub.resolves([]);

            getRawTxHexStub
                .onCall(3).resolves("0200000000010445941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8040000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffffdb877a4316a5c61e797435fb6d4fd282740f2a15a87bf8c9c95d55f35c49790d0100000000ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388710270000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a505700000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87090300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787110500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388796ac4f000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388702483045022100bc813611265bf0e501e9b0d3d5838b0a02ad6482e610c6f4c53651bf642eee84022060ae67207ef75ad22007c06525d0f08a1b443e85ae65fbe5d87ed2609a56084c0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050247304402201f6c26c3e82611caa8533cf5abbc1e579206fecb3916008d088a2b911b8cf7620220752652de5bdb041515a55c45097e6fee3b9d29c82f94565b8a06190cf60300610121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501411cb12ebe916ecaa98b80ed0bbe3b766aa738f12cf3889f40af38c1079c7fa306103fbfe282fe13e408c4c4dc8a3542cfa6eabae953c1db6f698b4b07477de1bb8302483045022100b83bc3c89ffa1fdfbfa19c6f7e7369723fe80aedd9086c0f2788092f8362222c02203bd6c7511c8b796d9fa8c022639577d1a94d3174620a47c13ed96174f4c86a720121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000");
            updateOrderbookByIdsStub.resolves(true);
            createTradeHistoryStub.resolves(true);
            enterInitiatedStateStub.resolves({ data: [], error: null});
            const result = await marketplaceListing.createTakerPSBT(
                [request.id],
                request.takerPaymentAddress,
                request.takerPaymentPublicKey,
                request.takerOrdinalAddress,
                request.marketplaceId,
                request.feeRate
            );

            expect(result).to.have.property('psbt');
            expect(result.psbt).to.be.an('string');
            expect(result).to.have.property('inputIndices');
            expect(result.inputIndices).to.be.an('array');
            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.takerOrdinalAddress);
            expect(getOrInsertAddressStub.secondCall.args[0]).to.deep.equal(request.takerPaymentAddress,request.takerPaymentPublicKey);
            expect(getAddressUtxosStub.callCount).to.equal(1);
            expect(getRawTxHexStub.callCount).to.equal(4);
            // getOutputStub calls
            // 1- actual utxo being bought
            // 2- dummy utxo with rune in it
            // 3,4- dummy utxos with no rune
            // 5- payment utxo
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1");
            expect(getOutputStub.args[4][0]).to.deep.equal("12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc:7");
            expect(getOutputStub.callCount).to.equal(5);
            expect(enterInitiatedStateStub.calledOnceWithExactly(
                [
                    {
                        order_id: 1,
                        marketplace_taker_fee_collected_bips: 0,
                        marketplace_fee_collected_sats: 546,
                        platform_taker_fee_collected_bips: 100,
                        platfrom_fee_collected_sats: 546
                    }
                ],
                takerPaymentAddressId,
                takerOrdinalAddressId,
                ORDERBOOK_STATUS.pending_taker_confirmation,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });

        it('should fail if dummy utxos include runes', async () => {
          // Simulate order data
          getActiveOrBroadcastOrderbooksStub.resolves({
              data: [{
                  id: request.id,
                  price: 1000,
                  status: 'active',
                  platform_maker_fee: 100,
                  platform_taker_fee: 100,
                  marketplace_taker_fee: 0,
                  marketplace_maker_fee: 499,
                  maker_output_value: 2000,
                  utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                  maker_payment: { address: request.takerPaymentAddress },
                  platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                  marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                  maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" }
              }],
              error: null
          });

          getOrInsertAddressStub
            .onFirstCall().resolves({ id: 3, address: request.takerOrdinalAddress })
            .onSecondCall().resolves({ id: 4, address: request.takerPaymentAddress, public_key: request.takerPaymentPublicKey });
          getAddressUtxosStub.onFirstCall().resolves([
              {
                  "txid": "57c75f5456c67c2cf456392e80fb989d767aa4d2d07427028fe0ec915157034e",
                  "vout": 8,
                  "status": {
                      "confirmed": true,
                      "block_height": 2810336,
                      "block_hash": "00000000000000c350cec25179001f1258f7bb45c4702de739cef8ae28e23749",
                      "block_time": 1714564755
                  },
                  "value": 600
              },
              {
                  "txid": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                  "vout": 2,
                  "status": {
                      "confirmed": true,
                      "block_height": 2810336,
                      "block_hash": "00000000000000c350cec25179001f1258f7bb45c4702de739cef8ae28e23749",
                      "block_time": 1714564755
                  },
                  "value": 600
              },
              {
                  "txid": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                  "vout": 0,
                  "status": {
                      "confirmed": true,
                      "block_height": 3081551,
                      "block_hash": "000000000000002cf9e6f5d7197e59ac61224464d65ae4abeb90f6f1df21ef20",
                      "block_time": 1728388358
                  },
                  "value": 600
              },
              {
                  "txid": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                  "vout": 7,
                  "status": {
                      "confirmed": true,
                      "block_height": 3081570,
                      "block_hash": "00000000729177c2581376ebf3239d7acba5ef0ba8d4c599fc26ac7b4d2de2eb",
                      "block_time": 1728393244
                  },
                  "value": 7221526
              }
          ]);

          getRawTxHexStub
              .onCall(0).resolves("02000000000104f24ec8ec29b9e052312629076ea37b663f114c7c677acaf95aac0620e7b8efac0100000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffeb581fbf5ea282d4a2208b96a4b88ecddb8de2e2699edae683ca0e671603c52b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff2794df22847bc57d32c56ce61b836b0a3f76359650924ff6ae3004154062b5a80000000000ffffffff2b48e1ab76cafda6e8dfb25a7dc802e53ab479b8d862f3076dff5a30207abbc80000000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff06b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cb200f00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87cc8306000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87024730440220755b78633be6d5806a3ce54e962afa22af2237af2a1aaefde64178b98648a66d022012847fe2c8d3c24047ba866f7d129113dba856944bf6e8356ced6fd96fae9b0b012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370247304402203b04e369dcf01f624ee4b058b94eb8e16a04cff75fed13e38a5b2a5c128e4ad8022076ba844007f28da84af58fee8b8ac2417100d43c676d038c6d1947129c68ceb3012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3701419e8c84bfd835eb022d76d9e1ff79e4a0a2e706140fbc36878ed2a00091a240bf08acc9384336148aa9e9d58d2ea229830f3dd253ef809bde6935c548fcab8bbd8302483045022100c7c9ddd99268e3fe5ea51a547e4a99e12630e404bc1544bb650a67c19f77680a02205f9f00be366daaadd0c3a48b2176843b6ffa6f44468baaa26ce995d8515a7df5012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000")
              .onCall(1).resolves("020000000001041ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff26ba4e2d2984241f55dd74d97734f1e409287d8477bb9329e1b107e757c69b4e0000000000ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2070000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388722020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a5d3300000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87450300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787750500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b138873a1c51000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887024730440220203b3447fc5019dcafa8aed40ee4e6b7fb9b3de720d4f12e208d7562d997f9e902201566e18cb7e65672a28f8c37225420779cef88c593a9c0b95fedbd17bb3996cb0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0502483045022100c9b94c57dad07e943473c340fbd318577a21b401bb09d700da9690b03e380b270220133bd41a90c86fdfa2767e130071b5df1782a78c089340bd7ad572508a9588010121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501415c875f09cb5cd1413f75b1579abb058e9f3caaeee1962d57e81c1c80dba34b29522e84991c5d0740d9d5986e86d96741a524e65dfe9cc4209179a93e8adbeef8830247304402206c0c8bdae511d2df7db45a0e2caab4f9425ab68db56c3435d8ab1ce35331b1c9022050f9e7a2e2a77400f3de5019eedb6d0586f523494a60cb6b9f66402f0b3206900121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000")
              .onCall(2).resolves("02000000000104b93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffbb9761229af55fd9b4d1d5090854947423831c769be5d5a534cdf6bf161e20130300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff803e3b31cc97d77c71c349f8d5d260204742ae7be3944ca9e4ad51085d9afb130000000000ffffffffb93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0500000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff07b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cbc53a00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887900300000000000017a914ebbd919e2d532788ad2d4020044018db716c82d387580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87f4b30c000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f870247304402207d68a86708375d1bf85ee6afb45da630b932c6af9f0cc4a6ac0d80bec8aafc1502202915306036beff927cb8707c2386c64ab0f5a415ec777f09b970d3edb5419569012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3702483045022100ecf00430ca4821536c9289cf1693167ce65a7ae20c3338b15127d621d60ffa82022048cb9011cee21a475faa0f2f638d696710708251368b7824cf33ea6bce7e3c4e012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370141b732bee064f782b53b68b999b4a1997684bef6a3ea43eb2ae9bcb3d1a1025e296b613e45f70085770a1a2190a25a5c73170dcacab0009d46e59cf5cf832aaf3b83024730440220777644f084f9ed2f12b0ef763b0e4f6079ebb820933e2001bb484701eb4a13f10220654bf4c5b1f050dd78b6bb505d9a43d8a04c04f1a4860de8310d77c9e184e3e0012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000");

          getOutputStub.onCall(0).resolves({
                  address: "some-taproot-address",
                  indexed: true,
                  inscriptions: [],
                  runes: [],
                  sat_ranges: null,
                  script_pubkey: "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                  spent: false,
                  transaction: "cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13",
                  value: 546
          });
          getOutputStub.onCall(1).resolves({
                  "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                  "indexed": true,
                  "inscriptions": [],
                  "runes": [
                      [
                          "ORDINALSBOT•TESTING•RUNE1",
                          {
                              "amount": 222,
                              "divisibility": 2,
                              "symbol": "🤖"
                          }
                      ]
                  ],
                  "sat_ranges": null,
                  "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                  "spent": false,
                  "transaction": "57c75f5456c67c2cf456392e80fb989d767aa4d2d07427028fe0ec915157034e",
                  "value": 600
          });
          getOutputStub.onCall(2).resolves({
                  "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                  "indexed": true,
                  "inscriptions": [],
                  "runes":                         [
                      "ORDINALSBOT•TESTING•RUNE1",
                      {
                          "amount": 111,
                          "divisibility": 2,
                          "symbol": "🤖"
                      }
                  ],
                  "sat_ranges": null,
                  "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                  "spent": false,
                  "transaction": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                  "value": 600
          });
          getOutputStub.onCall(3).resolves({
                  "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                  "indexed": true,
                  "inscriptions": [],
                  "runes": {},
                  "sat_ranges": null,
                  "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                  "spent": false,
                  "transaction": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                  "value": 600
          });
          getOutputStub.onCall(4).resolves({
                  "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                  "indexed": true,
                  "inscriptions": [],
                  "runes": {},
                  "sat_ranges": null,
                  "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                  "spent": false,
                  "transaction": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                  "value": 5221526
          });

          findSpecialRangesUtxosStub.resolves([]);

          getRawTxHexStub
              .onCall(3).resolves("0200000000010445941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8040000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffffdb877a4316a5c61e797435fb6d4fd282740f2a15a87bf8c9c95d55f35c49790d0100000000ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388710270000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a505700000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87090300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787110500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388796ac4f000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388702483045022100bc813611265bf0e501e9b0d3d5838b0a02ad6482e610c6f4c53651bf642eee84022060ae67207ef75ad22007c06525d0f08a1b443e85ae65fbe5d87ed2609a56084c0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050247304402201f6c26c3e82611caa8533cf5abbc1e579206fecb3916008d088a2b911b8cf7620220752652de5bdb041515a55c45097e6fee3b9d29c82f94565b8a06190cf60300610121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501411cb12ebe916ecaa98b80ed0bbe3b766aa738f12cf3889f40af38c1079c7fa306103fbfe282fe13e408c4c4dc8a3542cfa6eabae953c1db6f698b4b07477de1bb8302483045022100b83bc3c89ffa1fdfbfa19c6f7e7369723fe80aedd9086c0f2788092f8362222c02203bd6c7511c8b796d9fa8c022639577d1a94d3174620a47c13ed96174f4c86a720121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000");
          const result = await marketplaceListing.createTakerPSBT(
                  [request.id],
                  request.takerPaymentAddress,
                  request.takerPaymentPublicKey,
                  request.takerOrdinalAddress,
                  request.marketplaceId,
                  request.feeRate
          );
          // Assert that the result is as expected
          expect(result).to.deep.equal({
                error: 'Taker address does not have enough padding utxos',
                requiredDummyOutputs: 2,
                additionalOutputsNeeded: 1
          });
        });

        it.skip('should use unconfirmed dummy utxos if they do not include assets', async () => {
            // Simulate order data
            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: request.id,
                    price: 1000,
                    status: 'active',
                    platform_maker_fee: 100,
                    platform_taker_fee: 100,
                    marketplace_taker_fee: 0,
                    marketplace_maker_fee: 499,
                    maker_output_value: 2000,
                    utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                    maker_payment: { address: request.takerPaymentAddress },
                    platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                    marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                    maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" }
                }],
                error: null
            });
            request.takerPaymentAddress = '2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe';

            getOrInsertAddressStub
                .onFirstCall().resolves(takerOrdinalAddressId)
                .onSecondCall().resolves(takerPaymentAddressId);
            
            getOutputStub
                .onCall(0).resolves({
                    address: "some-taproot-address",
                    indexed: true,
                    inscriptions: [],
                    runes: [],
                    sat_ranges: null,
                    script_pubkey: "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    spent: false,
                    transaction: "cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13",
                    value: 546
                })
                .onCall(1).resolves({
                    "address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": [],
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "57c75f5456c67c2cf456392e80fb989d767aa4d2d07427028fe0ec915157034e",
                    "value": 600
                })
                .onCall(2).resolves({
                    "address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": [],
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                    "value": 600
                })
                .onCall(3).resolves({
                    "address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": {},
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                    "value": 600
                })
                .onCall(4).resolves({
                    "address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": {},
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "value": 5221526
                });

            getAddressUtxosStub.onFirstCall().resolves([
                {
                    "txid": "9bc757dceb558e035e1413a7cbe9dfbef89c2682ec47739ddbb0ca831c9d3616",
                    "vout": 0,
                    "status": {
                        "confirmed": false
                    },
                    "value": 600
                },
                {
                    "txid": "9bc757dceb558e035e1413a7cbe9dfbef89c2682ec47739ddbb0ca831c9d3616",
                    "vout": 1,
                    "status": {
                        "confirmed": false
                    },
                    "value": 600
                },
                {
                    "txid": "9bc757dceb558e035e1413a7cbe9dfbef89c2682ec47739ddbb0ca831c9d3616",
                    "vout": 2,
                    "status": {
                        "confirmed": false
                    },
                    "value": 600
                },
                {
                    "txid": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "vout": 7,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081570,
                        "block_hash": "00000000729177c2581376ebf3239d7acba5ef0ba8d4c599fc26ac7b4d2de2eb",
                        "block_time": 1728393244
                    },
                    "value": 7221526
                }
            ]);

            getRawTxHexStub
                .onCall(0).resolves("020000000001041ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff26ba4e2d2984241f55dd74d97734f1e409287d8477bb9329e1b107e757c69b4e0000000000ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2070000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388722020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a5d3300000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87450300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787750500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b138873a1c51000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887024730440220203b3447fc5019dcafa8aed40ee4e6b7fb9b3de720d4f12e208d7562d997f9e902201566e18cb7e65672a28f8c37225420779cef88c593a9c0b95fedbd17bb3996cb0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0502483045022100c9b94c57dad07e943473c340fbd318577a21b401bb09d700da9690b03e380b270220133bd41a90c86fdfa2767e130071b5df1782a78c089340bd7ad572508a9588010121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501415c875f09cb5cd1413f75b1579abb058e9f3caaeee1962d57e81c1c80dba34b29522e84991c5d0740d9d5986e86d96741a524e65dfe9cc4209179a93e8adbeef8830247304402206c0c8bdae511d2df7db45a0e2caab4f9425ab68db56c3435d8ab1ce35331b1c9022050f9e7a2e2a77400f3de5019eedb6d0586f523494a60cb6b9f66402f0b3206900121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000")
                .onCall(1).resolves("02000000000101f94e9f2f9fd04c7ee01dc4606231626333ae3ae71dfc25eebe37de13365a2f090000000017160014623236ba5bcf88dab139640728fc4af8f77420eeffffffff04580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387878898000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c438702483045022100d393221f92c8510a5a39fdc53a4f3af8f9158ea2a187ddb9d17180bd98b665cc02201cec7709cbe802f10ab2a1e48ddc49bc30e291e0b9ad48a897029c7e186aff8d01210223257abd76701f8f74e830e3259c6dc176790dcdeb4928d85aea3c514fabe4c500000000")
                .onCall(2).resolves("02000000000101f94e9f2f9fd04c7ee01dc4606231626333ae3ae71dfc25eebe37de13365a2f090000000017160014623236ba5bcf88dab139640728fc4af8f77420eeffffffff04580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387878898000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c438702483045022100d393221f92c8510a5a39fdc53a4f3af8f9158ea2a187ddb9d17180bd98b665cc02201cec7709cbe802f10ab2a1e48ddc49bc30e291e0b9ad48a897029c7e186aff8d01210223257abd76701f8f74e830e3259c6dc176790dcdeb4928d85aea3c514fabe4c500000000")      
                .onCall(3).resolves("02000000000104b93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffbb9761229af55fd9b4d1d5090854947423831c769be5d5a534cdf6bf161e20130300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff803e3b31cc97d77c71c349f8d5d260204742ae7be3944ca9e4ad51085d9afb130000000000ffffffffb93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0500000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff07b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cbc53a00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887900300000000000017a914ebbd919e2d532788ad2d4020044018db716c82d387580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87f4b30c000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f870247304402207d68a86708375d1bf85ee6afb45da630b932c6af9f0cc4a6ac0d80bec8aafc1502202915306036beff927cb8707c2386c64ab0f5a415ec777f09b970d3edb5419569012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3702483045022100ecf00430ca4821536c9289cf1693167ce65a7ae20c3338b15127d621d60ffa82022048cb9011cee21a475faa0f2f638d696710708251368b7824cf33ea6bce7e3c4e012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370141b732bee064f782b53b68b999b4a1997684bef6a3ea43eb2ae9bcb3d1a1025e296b613e45f70085770a1a2190a25a5c73170dcacab0009d46e59cf5cf832aaf3b83024730440220777644f084f9ed2f12b0ef763b0e4f6079ebb820933e2001bb484701eb4a13f10220654bf4c5b1f050dd78b6bb505d9a43d8a04c04f1a4860de8310d77c9e184e3e0012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000");

            getTransactionStub.resolves({
                "txid": "9bc757dceb558e035e1413a7cbe9dfbef89c2682ec47739ddbb0ca831c9d3616",
                "version": 2,
                "locktime": 0,
                "vin": [
                  {
                    "txid": "092f5a3613de37beee25fc1de73aae336362316260c41de07e4cd09f2f9f4ef9",
                    "vout": 0,
                    "prevout": {
                      "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                      "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                      "scriptpubkey_type": "p2sh",
                      "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                      "value": 9999000
                    },
                    "scriptsig": "160014623236ba5bcf88dab139640728fc4af8f77420ee",
                    "scriptsig_asm": "OP_PUSHBYTES_22 0014623236ba5bcf88dab139640728fc4af8f77420ee",
                    "witness": [
                      "3045022100d393221f92c8510a5a39fdc53a4f3af8f9158ea2a187ddb9d17180bd98b665cc02201cec7709cbe802f10ab2a1e48ddc49bc30e291e0b9ad48a897029c7e186aff8d01",
                      "0223257abd76701f8f74e830e3259c6dc176790dcdeb4928d85aea3c514fabe4c5"
                    ],
                    "is_coinbase": false,
                    "sequence": 4294967295,
                    "inner_redeemscript_asm": "OP_0 OP_PUSHBYTES_20 623236ba5bcf88dab139640728fc4af8f77420ee"
                  }
                ],
                "vout": [
                  {
                    "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                    "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                    "scriptpubkey_type": "p2sh",
                    "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "value": 600
                  },
                  {
                    "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                    "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                    "scriptpubkey_type": "p2sh",
                    "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "value": 600
                  },
                  {
                    "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                    "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                    "scriptpubkey_type": "p2sh",
                    "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "value": 600
                  },
                  {
                    "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                    "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                    "scriptpubkey_type": "p2sh",
                    "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "value": 9996423
                  }
                ],
                "size": 312,
                "weight": 918,
                "sigops": 1,
                "fee": 777,
                "status": {
                  "confirmed": true,
                  "block_height": 227765,
                  "block_hash": "000000404fd9b8562651b52070fdc1cb2376ea9c90188bea64c7845620c4cf7a",
                  "block_time": 1735065600
                }
            });

            findSpecialRangesUtxosStub.resolves([]);

            getRawTxHexStub
                .onCall(3).resolves("0200000000010445941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8040000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffffdb877a4316a5c61e797435fb6d4fd282740f2a15a87bf8c9c95d55f35c49790d0100000000ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388710270000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a505700000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87090300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787110500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388796ac4f000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388702483045022100bc813611265bf0e501e9b0d3d5838b0a02ad6482e610c6f4c53651bf642eee84022060ae67207ef75ad22007c06525d0f08a1b443e85ae65fbe5d87ed2609a56084c0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050247304402201f6c26c3e82611caa8533cf5abbc1e579206fecb3916008d088a2b911b8cf7620220752652de5bdb041515a55c45097e6fee3b9d29c82f94565b8a06190cf60300610121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501411cb12ebe916ecaa98b80ed0bbe3b766aa738f12cf3889f40af38c1079c7fa306103fbfe282fe13e408c4c4dc8a3542cfa6eabae953c1db6f698b4b07477de1bb8302483045022100b83bc3c89ffa1fdfbfa19c6f7e7369723fe80aedd9086c0f2788092f8362222c02203bd6c7511c8b796d9fa8c022639577d1a94d3174620a47c13ed96174f4c86a720121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000")
                .onCall(4).resolves("0200000000010445941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8040000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffffdb877a4316a5c61e797435fb6d4fd282740f2a15a87bf8c9c95d55f35c49790d0100000000ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388710270000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a505700000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87090300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787110500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388796ac4f000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388702483045022100bc813611265bf0e501e9b0d3d5838b0a02ad6482e610c6f4c53651bf642eee84022060ae67207ef75ad22007c06525d0f08a1b443e85ae65fbe5d87ed2609a56084c0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050247304402201f6c26c3e82611caa8533cf5abbc1e579206fecb3916008d088a2b911b8cf7620220752652de5bdb041515a55c45097e6fee3b9d29c82f94565b8a06190cf60300610121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501411cb12ebe916ecaa98b80ed0bbe3b766aa738f12cf3889f40af38c1079c7fa306103fbfe282fe13e408c4c4dc8a3542cfa6eabae953c1db6f698b4b07477de1bb8302483045022100b83bc3c89ffa1fdfbfa19c6f7e7369723fe80aedd9086c0f2788092f8362222c02203bd6c7511c8b796d9fa8c022639577d1a94d3174620a47c13ed96174f4c86a720121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000");
            enterInitiatedStateStub.resolves({ data: [], error: null});
            const result = await marketplaceListing.createTakerPSBT(
                [request.id],
                request.takerPaymentAddress,
                request.takerPaymentPublicKey,
                request.takerOrdinalAddress,
                request.marketplaceId,
                request.feeRate
            );

            expect(result).to.have.property('psbt');
            expect(result.psbt).to.be.an('string');
            expect(result).to.have.property('inputIndices');
            expect(result.inputIndices).to.be.an('array');
            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.takerOrdinalAddress);
            expect(getOrInsertAddressStub.secondCall.args[0]).to.deep.equal(request.takerPaymentAddress,request.takerPaymentPublicKey);
            expect(getAddressUtxosStub.callCount).to.equal(1);
            expect(getRawTxHexStub.callCount).to.equal(4);
            // getOutputStub calls
            // 1- actual utxo being bought
            // 2,3 - dummy utxos unconfirmed
            // 4- payment utxo
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1");
            expect(getOutputStub.args[3][0]).to.deep.equal("12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc:7");
            expect(getOutputStub.callCount).to.equal(4);
            expect(enterInitiatedStateStub.calledOnceWithExactly(
                [
                    {
                        order_id: 1,
                        marketplace_taker_fee_collected_bips: 0,
                        marketplace_fee_collected_sats: 546,
                        platform_taker_fee_collected_bips: 100,
                        platfrom_fee_collected_sats: 546
                    }
                ],
                takerPaymentAddressId,
                takerOrdinalAddressId,
                ORDERBOOK_STATUS.pending_taker_confirmation,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });

        it.skip('should use unconfirmed dummy utxos with unconfirmed inputs from buy transaction', async () => {
            // Simulate order data
            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: request.id,
                    price: 1000,
                    status: 'active',
                    platform_maker_fee: 100,
                    platform_taker_fee: 100,
                    marketplace_taker_fee: 0,
                    marketplace_maker_fee: 499,
                    maker_output_value: 2000,
                    utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                    maker_payment: { address: request.takerPaymentAddress },
                    platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                    marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                    maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" }
                }],
                error: null
            });
            request.takerPaymentAddress = '2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe';

            getOrInsertAddressStub
                .onFirstCall().resolves(takerOrdinalAddressId)
                .onSecondCall().resolves(takerPaymentAddressId);
            getWalletTrioBalanceStub.resolves(0);
            getOutputStub
                .onCall(0).resolves({
                    address: "some-taproot-address",
                    indexed: true,
                    inscriptions: [],
                    runes: [],
                    sat_ranges: null,
                    script_pubkey: "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    spent: false,
                    transaction: "cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13",
                    value: 546
                })
                .onCall(1).resolves({
                    "address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": [],
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "57c75f5456c67c2cf456392e80fb989d767aa4d2d07427028fe0ec915157034e",
                    "value": 600
                })
                .onCall(2).resolves({
                    "address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": [],
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                    "value": 600
                })
                .onCall(3).resolves({
                    "address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": {},
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                    "value": 600
                })
                .onCall(4).resolves({
                    "address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "indexed": true,
                    "inscriptions": [],
                    "runes": {},
                    "sat_ranges": null,
                    "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                    "spent": false,
                    "transaction": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "value": 5221526
                });

            getAddressUtxosStub.onFirstCall().resolves([
                {
                    "txid": "9bc757dceb558e035e1413a7cbe9dfbef89c2682ec47739ddbb0ca831c9d3616",
                    "vout": 0,
                    "status": {
                        "confirmed": false
                    },
                    "value": 600
                },
                {
                    "txid": "9bc757dceb558e035e1413a7cbe9dfbef89c2682ec47739ddbb0ca831c9d3616",
                    "vout": 1,
                    "status": {
                        "confirmed": false
                    },
                    "value": 600
                },
                {
                    "txid": "9bc757dceb558e035e1413a7cbe9dfbef89c2682ec47739ddbb0ca831c9d3616",
                    "vout": 2,
                    "status": {
                        "confirmed": false
                    },
                    "value": 600
                },
                {
                    "txid": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                    "vout": 7,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081570,
                        "block_hash": "00000000729177c2581376ebf3239d7acba5ef0ba8d4c599fc26ac7b4d2de2eb",
                        "block_time": 1728393244
                    },
                    "value": 7221526
                }
            ]);

            getRawTxHexStub
                .onCall(0).resolves("020000000001041ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff26ba4e2d2984241f55dd74d97734f1e409287d8477bb9329e1b107e757c69b4e0000000000ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2070000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388722020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a5d3300000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87450300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787750500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b138873a1c51000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887024730440220203b3447fc5019dcafa8aed40ee4e6b7fb9b3de720d4f12e208d7562d997f9e902201566e18cb7e65672a28f8c37225420779cef88c593a9c0b95fedbd17bb3996cb0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0502483045022100c9b94c57dad07e943473c340fbd318577a21b401bb09d700da9690b03e380b270220133bd41a90c86fdfa2767e130071b5df1782a78c089340bd7ad572508a9588010121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501415c875f09cb5cd1413f75b1579abb058e9f3caaeee1962d57e81c1c80dba34b29522e84991c5d0740d9d5986e86d96741a524e65dfe9cc4209179a93e8adbeef8830247304402206c0c8bdae511d2df7db45a0e2caab4f9425ab68db56c3435d8ab1ce35331b1c9022050f9e7a2e2a77400f3de5019eedb6d0586f523494a60cb6b9f66402f0b3206900121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000")
                .onCall(1).resolves("02000000000101f94e9f2f9fd04c7ee01dc4606231626333ae3ae71dfc25eebe37de13365a2f090000000017160014623236ba5bcf88dab139640728fc4af8f77420eeffffffff04580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387878898000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c438702483045022100d393221f92c8510a5a39fdc53a4f3af8f9158ea2a187ddb9d17180bd98b665cc02201cec7709cbe802f10ab2a1e48ddc49bc30e291e0b9ad48a897029c7e186aff8d01210223257abd76701f8f74e830e3259c6dc176790dcdeb4928d85aea3c514fabe4c500000000")
                .onCall(2).resolves("02000000000101f94e9f2f9fd04c7ee01dc4606231626333ae3ae71dfc25eebe37de13365a2f090000000017160014623236ba5bcf88dab139640728fc4af8f77420eeffffffff04580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387580200000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387878898000000000017a914ae3cece1bcf9446bd318b20fcc53a6b563e20c438702483045022100d393221f92c8510a5a39fdc53a4f3af8f9158ea2a187ddb9d17180bd98b665cc02201cec7709cbe802f10ab2a1e48ddc49bc30e291e0b9ad48a897029c7e186aff8d01210223257abd76701f8f74e830e3259c6dc176790dcdeb4928d85aea3c514fabe4c500000000")      
                .onCall(3).resolves("02000000000104b93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffbb9761229af55fd9b4d1d5090854947423831c769be5d5a534cdf6bf161e20130300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff803e3b31cc97d77c71c349f8d5d260204742ae7be3944ca9e4ad51085d9afb130000000000ffffffffb93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0500000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff07b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cbc53a00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887900300000000000017a914ebbd919e2d532788ad2d4020044018db716c82d387580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87f4b30c000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f870247304402207d68a86708375d1bf85ee6afb45da630b932c6af9f0cc4a6ac0d80bec8aafc1502202915306036beff927cb8707c2386c64ab0f5a415ec777f09b970d3edb5419569012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3702483045022100ecf00430ca4821536c9289cf1693167ce65a7ae20c3338b15127d621d60ffa82022048cb9011cee21a475faa0f2f638d696710708251368b7824cf33ea6bce7e3c4e012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370141b732bee064f782b53b68b999b4a1997684bef6a3ea43eb2ae9bcb3d1a1025e296b613e45f70085770a1a2190a25a5c73170dcacab0009d46e59cf5cf832aaf3b83024730440220777644f084f9ed2f12b0ef763b0e4f6079ebb820933e2001bb484701eb4a13f10220654bf4c5b1f050dd78b6bb505d9a43d8a04c04f1a4860de8310d77c9e184e3e0012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000");

            // this is marketplace buy transaction with padding inputs + inscription + payment utxo
            getTransactionStub.resolves({
                "txid": "9bc757dceb558e035e1413a7cbe9dfbef89c2682ec47739ddbb0ca831c9d3616",
                "version": 2,
                "locktime": 0,
                "vin": [
                  {
                    "txid": "092f5a3613de37beee25fc1de73aae336362316260c41de07e4cd09f2f9f4ef9",
                    "vout": 0,
                    "prevout": {
                      "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                      "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                      "scriptpubkey_type": "p2sh",
                      "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                      "value": 600
                    },
                    "scriptsig": "160014623236ba5bcf88dab139640728fc4af8f77420ee",
                    "scriptsig_asm": "OP_PUSHBYTES_22 0014623236ba5bcf88dab139640728fc4af8f77420ee",
                    "witness": [
                      "3045022100d393221f92c8510a5a39fdc53a4f3af8f9158ea2a187ddb9d17180bd98b665cc02201cec7709cbe802f10ab2a1e48ddc49bc30e291e0b9ad48a897029c7e186aff8d01",
                      "0223257abd76701f8f74e830e3259c6dc176790dcdeb4928d85aea3c514fabe4c5"
                    ],
                    "is_coinbase": false,
                    "sequence": 4294967295,
                    "inner_redeemscript_asm": "OP_0 OP_PUSHBYTES_20 623236ba5bcf88dab139640728fc4af8f77420ee"
                  },
                  {
                    "txid": "092f5a3613de37beee25fc1de73aae336362316260c41de07e4cd09f2f9f4ef9",
                    "vout": 1,
                    "prevout": {
                      "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                      "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                      "scriptpubkey_type": "p2sh",
                      "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                      "value": 600
                    },
                    "scriptsig": "160014623236ba5bcf88dab139640728fc4af8f77420ee",
                    "scriptsig_asm": "OP_PUSHBYTES_22 0014623236ba5bcf88dab139640728fc4af8f77420ee",
                    "witness": [
                      "3045022100d393221f92c8510a5a39fdc53a4f3af8f9158ea2a187ddb9d17180bd98b665cc02201cec7709cbe802f10ab2a1e48ddc49bc30e291e0b9ad48a897029c7e186aff8d01",
                      "0223257abd76701f8f74e830e3259c6dc176790dcdeb4928d85aea3c514fabe4c5"
                    ],
                    "is_coinbase": false,
                    "sequence": 4294967295,
                    "inner_redeemscript_asm": "OP_0 OP_PUSHBYTES_20 623236ba5bcf88dab139640728fc4af8f77420ee"
                  },
                  {
                    "txid": "092f5a3613de37beee25fc1de73aae336362316260c41de07e4cd09f2f9f4ef9",
                    "vout": 2,
                    "prevout": {
                      "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                      "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                      "scriptpubkey_type": "p2sh",
                      "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                      "value": 546
                    },
                    "scriptsig": "160014623236ba5bcf88dab139640728fc4af8f77420ee",
                    "scriptsig_asm": "OP_PUSHBYTES_22 0014623236ba5bcf88dab139640728fc4af8f77420ee",
                    "witness": [
                      "3045022100d393221f92c8510a5a39fdc53a4f3af8f9158ea2a187ddb9d17180bd98b665cc02201cec7709cbe802f10ab2a1e48ddc49bc30e291e0b9ad48a897029c7e186aff8d01",
                      "0223257abd76701f8f74e830e3259c6dc176790dcdeb4928d85aea3c514fabe4c5"
                    ],
                    "is_coinbase": false,
                    "sequence": 4294967295,
                    "inner_redeemscript_asm": "OP_0 OP_PUSHBYTES_20 623236ba5bcf88dab139640728fc4af8f77420ee"
                  },
                  {
                    "txid": "092f5a3613de37beee25fc1de73aae336362316260c41de07e4cd09f2f9f4ef9",
                    "vout": 3,
                    "prevout": {
                      "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                      "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                      "scriptpubkey_type": "p2sh",
                      "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                      "value": 9999000
                    },
                    "scriptsig": "160014623236ba5bcf88dab139640728fc4af8f77420ee",
                    "scriptsig_asm": "OP_PUSHBYTES_22 0014623236ba5bcf88dab139640728fc4af8f77420ee",
                    "witness": [
                      "3045022100d393221f92c8510a5a39fdc53a4f3af8f9158ea2a187ddb9d17180bd98b665cc02201cec7709cbe802f10ab2a1e48ddc49bc30e291e0b9ad48a897029c7e186aff8d01",
                      "0223257abd76701f8f74e830e3259c6dc176790dcdeb4928d85aea3c514fabe4c5"
                    ],
                    "is_coinbase": false,
                    "sequence": 4294967295,
                    "inner_redeemscript_asm": "OP_0 OP_PUSHBYTES_20 623236ba5bcf88dab139640728fc4af8f77420ee"
                  }
                ],
                "vout": [
                  {
                    "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                    "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                    "scriptpubkey_type": "p2sh",
                    "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "value": 600
                  },
                  {
                    "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                    "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                    "scriptpubkey_type": "p2sh",
                    "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "value": 600
                  },
                  {
                    "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                    "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                    "scriptpubkey_type": "p2sh",
                    "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "value": 600
                  },
                  {
                    "scriptpubkey": "a914ae3cece1bcf9446bd318b20fcc53a6b563e20c4387",
                    "scriptpubkey_asm": "OP_HASH160 OP_PUSHBYTES_20 ae3cece1bcf9446bd318b20fcc53a6b563e20c43 OP_EQUAL",
                    "scriptpubkey_type": "p2sh",
                    "scriptpubkey_address": "2N98WYpyAHmJpcHjEFQL64BPXEn6k5wTJFe",
                    "value": 9996423
                  }
                ],
                "size": 312,
                "weight": 918,
                "sigops": 1,
                "fee": 777,
                "status": {
                  "confirmed": false,
                }
            });

            findSpecialRangesUtxosStub.resolves([]);

            getRawTxHexStub
                .onCall(3).resolves("0200000000010445941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8040000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffffdb877a4316a5c61e797435fb6d4fd282740f2a15a87bf8c9c95d55f35c49790d0100000000ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388710270000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a505700000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87090300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787110500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388796ac4f000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388702483045022100bc813611265bf0e501e9b0d3d5838b0a02ad6482e610c6f4c53651bf642eee84022060ae67207ef75ad22007c06525d0f08a1b443e85ae65fbe5d87ed2609a56084c0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050247304402201f6c26c3e82611caa8533cf5abbc1e579206fecb3916008d088a2b911b8cf7620220752652de5bdb041515a55c45097e6fee3b9d29c82f94565b8a06190cf60300610121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501411cb12ebe916ecaa98b80ed0bbe3b766aa738f12cf3889f40af38c1079c7fa306103fbfe282fe13e408c4c4dc8a3542cfa6eabae953c1db6f698b4b07477de1bb8302483045022100b83bc3c89ffa1fdfbfa19c6f7e7369723fe80aedd9086c0f2788092f8362222c02203bd6c7511c8b796d9fa8c022639577d1a94d3174620a47c13ed96174f4c86a720121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000")
                .onCall(4).resolves("0200000000010445941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8040000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffffdb877a4316a5c61e797435fb6d4fd282740f2a15a87bf8c9c95d55f35c49790d0100000000ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388710270000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a505700000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87090300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787110500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388796ac4f000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388702483045022100bc813611265bf0e501e9b0d3d5838b0a02ad6482e610c6f4c53651bf642eee84022060ae67207ef75ad22007c06525d0f08a1b443e85ae65fbe5d87ed2609a56084c0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050247304402201f6c26c3e82611caa8533cf5abbc1e579206fecb3916008d088a2b911b8cf7620220752652de5bdb041515a55c45097e6fee3b9d29c82f94565b8a06190cf60300610121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501411cb12ebe916ecaa98b80ed0bbe3b766aa738f12cf3889f40af38c1079c7fa306103fbfe282fe13e408c4c4dc8a3542cfa6eabae953c1db6f698b4b07477de1bb8302483045022100b83bc3c89ffa1fdfbfa19c6f7e7369723fe80aedd9086c0f2788092f8362222c02203bd6c7511c8b796d9fa8c022639577d1a94d3174620a47c13ed96174f4c86a720121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000");
            
            const result = await marketplaceListing.createTakerPSBT(
                [request.id],
                request.takerPaymentAddress,
                request.takerPaymentPublicKey,
                request.takerOrdinalAddress,
                request.marketplaceId,
                request.feeRate
            );

            expect(result).to.have.property('psbt');
            expect(result.psbt).to.be.an('string');
            expect(result).to.have.property('inputIndices');
            expect(result.inputIndices).to.be.an('array');
            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.takerOrdinalAddress);
            expect(getOrInsertAddressStub.secondCall.args[0]).to.deep.equal(request.takerPaymentAddress,request.takerPaymentPublicKey);
            expect(getAddressUtxosStub.callCount).to.equal(1);
            expect(getRawTxHexStub.callCount).to.equal(4);
            // getOutputStub calls
            // 0- actual utxo being bought
            // 1-5 inputs being checked since its unconfirmed
            // 7- payment utxo
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1");
            expect(getOutputStub.args[7][0]).to.deep.equal("12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc:7");
            expect(getOutputStub.callCount).to.equal(8);
            expect(enterInitiatedStateStub.calledOnceWithExactly(
                [
                    {
                        order_id: 1,
                        marketplace_taker_fee_collected_bips: 0,
                        marketplace_fee_collected_sats: 546,
                        platform_taker_fee_collected_bips: 100,
                        platfrom_fee_collected_sats: 546
                    }
                ],
                takerPaymentAddressId,
                takerOrdinalAddressId,
                ORDERBOOK_STATUS.pending_taker_confirmation,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
        });
      
        it('should use 0 marketplace fee if buyer has 500 trio', async () => {
          // Simulate order data
          getActiveOrBroadcastOrderbooksStub.resolves({
              data: [{
                  id: request.id,
                  price: 1000,
                  status: 'active',
                  platform_maker_fee: 100,
                  platform_taker_fee: 100,
                  marketplace_taker_fee: 0,
                  marketplace_maker_fee: 499,
                  maker_output_value: 2000,
                  utxos: { utxo: 'cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1' },
                  maker_payment: { address: request.takerPaymentAddress },
                  platform_fee: { address: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' },
                  marketplace_fee: { address: '2N4scbGwMzoqg6wg8zY1T84sbsoybZRZaBi' },
                  maker_ordinal: { public_key: "594a4aaf5da5b144d0fa6b47987d966029d892fbc4aebb23214853e8b053702e" }
              }],
              error: null
          });

          getOrInsertAddressStub
                .onFirstCall().resolves(takerOrdinalAddressId)
                .onSecondCall().resolves(takerPaymentAddressId);
          getOutputStub.resolves({ value: 546 });
          getAddressUtxosStub.onFirstCall().resolves([
              {
                  "txid": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                  "vout": 2,
                  "status": {
                      "confirmed": true,
                      "block_height": 2810336,
                      "block_hash": "00000000000000c350cec25179001f1258f7bb45c4702de739cef8ae28e23749",
                      "block_time": 1714564755
                  },
                  "value": 600
              },
              {
                  "txid": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                  "vout": 0,
                  "status": {
                      "confirmed": true,
                      "block_height": 3081551,
                      "block_hash": "000000000000002cf9e6f5d7197e59ac61224464d65ae4abeb90f6f1df21ef20",
                      "block_time": 1728388358
                  },
                  "value": 600
              },
              {
                "txid": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                "vout": 7,
                "status": {
                    "confirmed": true,
                    "block_height": 3081570,
                    "block_hash": "00000000729177c2581376ebf3239d7acba5ef0ba8d4c599fc26ac7b4d2de2eb",
                    "block_time": 1728393244
                },
                "value": 7221526
              }
          ]);

          getRawTxHexStub
              .onCall(0).resolves("02000000000104f24ec8ec29b9e052312629076ea37b663f114c7c677acaf95aac0620e7b8efac0100000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffeb581fbf5ea282d4a2208b96a4b88ecddb8de2e2699edae683ca0e671603c52b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff2794df22847bc57d32c56ce61b836b0a3f76359650924ff6ae3004154062b5a80000000000ffffffff2b48e1ab76cafda6e8dfb25a7dc802e53ab479b8d862f3076dff5a30207abbc80000000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff06b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cb200f00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87cc8306000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87024730440220755b78633be6d5806a3ce54e962afa22af2237af2a1aaefde64178b98648a66d022012847fe2c8d3c24047ba866f7d129113dba856944bf6e8356ced6fd96fae9b0b012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370247304402203b04e369dcf01f624ee4b058b94eb8e16a04cff75fed13e38a5b2a5c128e4ad8022076ba844007f28da84af58fee8b8ac2417100d43c676d038c6d1947129c68ceb3012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3701419e8c84bfd835eb022d76d9e1ff79e4a0a2e706140fbc36878ed2a00091a240bf08acc9384336148aa9e9d58d2ea229830f3dd253ef809bde6935c548fcab8bbd8302483045022100c7c9ddd99268e3fe5ea51a547e4a99e12630e404bc1544bb650a67c19f77680a02205f9f00be366daaadd0c3a48b2176843b6ffa6f44468baaa26ce995d8515a7df5012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000")
              .onCall(1).resolves("020000000001041ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff26ba4e2d2984241f55dd74d97734f1e409287d8477bb9329e1b107e757c69b4e0000000000ffffffff1ee3a5a9ed543ae3f2ebb740536708ca04a4f422e7ddaeceee69f4de532275b2070000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388722020000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a5d3300000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87450300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787750500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b138873a1c51000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887024730440220203b3447fc5019dcafa8aed40ee4e6b7fb9b3de720d4f12e208d7562d997f9e902201566e18cb7e65672a28f8c37225420779cef88c593a9c0b95fedbd17bb3996cb0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0502483045022100c9b94c57dad07e943473c340fbd318577a21b401bb09d700da9690b03e380b270220133bd41a90c86fdfa2767e130071b5df1782a78c089340bd7ad572508a9588010121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501415c875f09cb5cd1413f75b1579abb058e9f3caaeee1962d57e81c1c80dba34b29522e84991c5d0740d9d5986e86d96741a524e65dfe9cc4209179a93e8adbeef8830247304402206c0c8bdae511d2df7db45a0e2caab4f9425ab68db56c3435d8ab1ce35331b1c9022050f9e7a2e2a77400f3de5019eedb6d0586f523494a60cb6b9f66402f0b3206900121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000")
              .onCall(2).resolves("02000000000104b93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffffbb9761229af55fd9b4d1d5090854947423831c769be5d5a534cdf6bf161e20130300000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff803e3b31cc97d77c71c349f8d5d260204742ae7be3944ca9e4ad51085d9afb130000000000ffffffffb93bb150a6a725c9017a0fd9cf618789131ac9e32889844dbc326811d9dd7d1b0500000017160014a63cc6d8dc761d4845559008d4467667f5563dd3ffffffff07b00400000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f871027000000000000225120f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cbc53a00000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887900300000000000017a914ebbd919e2d532788ad2d4020044018db716c82d387580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87580200000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87f4b30c000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f870247304402207d68a86708375d1bf85ee6afb45da630b932c6af9f0cc4a6ac0d80bec8aafc1502202915306036beff927cb8707c2386c64ab0f5a415ec777f09b970d3edb5419569012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3702483045022100ecf00430ca4821536c9289cf1693167ce65a7ae20c3338b15127d621d60ffa82022048cb9011cee21a475faa0f2f638d696710708251368b7824cf33ea6bce7e3c4e012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf370141b732bee064f782b53b68b999b4a1997684bef6a3ea43eb2ae9bcb3d1a1025e296b613e45f70085770a1a2190a25a5c73170dcacab0009d46e59cf5cf832aaf3b83024730440220777644f084f9ed2f12b0ef763b0e4f6079ebb820933e2001bb484701eb4a13f10220654bf4c5b1f050dd78b6bb505d9a43d8a04c04f1a4860de8310d77c9e184e3e0012102960433a71cd6d12a296dc076b3e540a7431f7ddd6a0f811972f04bb8d717cf3700000000");

          
          getOutputStub.resolves({
                  "address": "2N6ZePLQrKtix9bJBfznsykxKX1XtirnbKL",
                  "indexed": false,
                  "inscriptions": [],
                  "runes": {},
                  "sat_ranges": null,
                  "script_pubkey": "OP_HASH160 OP_PUSHBYTES_20 92157d0ba479637be6e75fbbb91eacc4fb35b138 OP_EQUAL",
                  "spent": true,
                  "transaction": "12dff9adf51a1f6c3c4f05fa929a0d66d09f55b3495216bb703aebee1417d8bc",
                  "value": 5221526
          });

          findSpecialRangesUtxosStub.resolves([]);
          getWalletTrioBalanceStub.resolves(1000);

          getRawTxHexStub
              .onCall(3).resolves("0200000000010445941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8040000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffffdb877a4316a5c61e797435fb6d4fd282740f2a15a87bf8c9c95d55f35c49790d0100000000ffffffff45941a259302b1bd34c0234b6de4c92a18f0e4ac576d66650544d010b5c727a8060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388710270000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a505700000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87090300000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787110500000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388796ac4f000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388702483045022100bc813611265bf0e501e9b0d3d5838b0a02ad6482e610c6f4c53651bf642eee84022060ae67207ef75ad22007c06525d0f08a1b443e85ae65fbe5d87ed2609a56084c0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050247304402201f6c26c3e82611caa8533cf5abbc1e579206fecb3916008d088a2b911b8cf7620220752652de5bdb041515a55c45097e6fee3b9d29c82f94565b8a06190cf60300610121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0501411cb12ebe916ecaa98b80ed0bbe3b766aa738f12cf3889f40af38c1079c7fa306103fbfe282fe13e408c4c4dc8a3542cfa6eabae953c1db6f698b4b07477de1bb8302483045022100b83bc3c89ffa1fdfbfa19c6f7e7369723fe80aedd9086c0f2788092f8362222c02203bd6c7511c8b796d9fa8c022639577d1a94d3174620a47c13ed96174f4c86a720121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000");
          enterInitiatedStateStub.resolves({ data: [], error: null });
          const result = await marketplaceListing.createTakerPSBT(
              [request.id],
              request.takerPaymentAddress,
              request.takerPaymentPublicKey,
              request.takerOrdinalAddress,
              request.marketplaceId,
              request.feeRate
          );

          expect(result).to.have.property('psbt');
          expect(result.psbt).to.be.an('string');
          expect(result).to.have.property('inputIndices');
          expect(result.inputIndices).to.be.an('array');
          expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
              [request.id],
              request.marketplaceId,
              ORDERBOOK_TYPE.listing
          )).to.be.true;
          expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.takerOrdinalAddress);
          expect(getOrInsertAddressStub.secondCall.args[0]).to.deep.equal(request.takerPaymentAddress,request.takerPaymentPublicKey);
          expect(getOutputStub.firstCall.args[0]).to.deep.equal("cd40de04f62bab945ce2570e3e551f0e7c761099ca0a4c746aa49fd3a40dbb13:1");
          expect(getAddressUtxosStub.callCount).to.equal(1);
          expect(getRawTxHexStub.callCount).to.equal(4);
          expect(getOutputStub.secondCall.args[0]).to.deep.equal("d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb:2");
          expect(getWalletTrioBalanceStub.calledOnce).to.be.true;
          expect(getWalletTrioBalanceStub.firstCall.args).to.deep.equal([request.takerOrdinalAddress]);
          expect(enterInitiatedStateStub.calledOnceWithExactly(
            [
                {
                    order_id: 1,
                    marketplace_taker_fee_collected_bips: 0,
                    marketplace_fee_collected_sats: 546,
                    platform_taker_fee_collected_bips: 100,
                    platfrom_fee_collected_sats: 546
                }
            ],
            takerPaymentAddressId,
            takerOrdinalAddressId,
            ORDERBOOK_STATUS.pending_taker_confirmation,
            ORDERBOOK_TYPE.listing
        )).to.be.true;
        });
    });

    describe('#mergeSignedPSBT', () => {
        const request = {
            "id": 1,
            "signedPSBTBase64": "cHNidP8BAP2ZAQIAAAAEtZhpObdj6fiU+VrLljZl1+LMhiL98FzYE3fjOlLd34IEAAAAAP////+1mGk5t2Pp+JT5WsuWNmXX4syGIv3wXNgTd+M6Ut3fggUAAAAA/////wD7Yu2Gr8JXNOCFBsZKWH1AhOCNVqwxV8o0MYseQTNpAAAAAAD/////9xhPZ1HLDPVrky8kCvFj2uk5WUa20j9gyX9rmH3bg0MBAAAAAP////8HsAQAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4ciAgAAAAAAACJRIPF+pE5+4fgDJyFvmtznshD3xhZ2+p7gp95auV9HqrnLzAYAAAAAAAAXqRSSFX0LpHlje+bnX7u5HqzE+zWxOIfoAwAAAAAAABepFH+LOf4kFYNcsrRSvrKVOmpQCAMoh1gCAAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HWAIAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4fNHgAAAAAAABepFMHIgkQhGoD4NIyPPtLT6IzH6o4PhwAAAAAAAQD9ZwMCAAAAAAEE7xgYEo0TNoaBiGiZ7ZuJoVcd8KKxkMjxHbohATR78K4EAAAAFxYAFKY8xtjcdh1IRVWQCNRGdmf1Vj3T/////+8YGBKNEzaGgYhome2biaFXHfCisZDI8R26IQE0e/CuBQAAABcWABSmPMbY3HYdSEVVkAjURnZn9VY90/////9Ez5qtJl5oxsdTJlNkws53Rk3N8TmUbWzZkzwyal9WmQAAAAAA/////4LAnbJnAzzH8PsojVx9wWUwM6yNXjvKgwdUfQ8CEL+sAgAAABcWABSmPMbY3HYdSEVVkAjURnZn9VY90/////8HsAQAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4ciAgAAAAAAACJRIPF+pE5+4fgDJyFvmtznshD3xhZ2+p7gp95auV9HqrnLwQsAAAAAAAAXqRSSFX0LpHlje+bnX7u5HqzE+zWxOIfoAwAAAAAAABepFH+LOf4kFYNcsrRSvrKVOmpQCAMoh1gCAAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HWAIAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4cMNAAAAAAAABepFMHIgkQhGoD4NIyPPtLT6IzH6o4PhwJIMEUCIQC+ysouJq6Crbl0nHWMw387YjFukDuRbjh44tjrYLFwgQIgMpLv7YQD9urcJkGxl49pBcggzmEP93+MHpl6q1lFFu0BIQKWBDOnHNbRKiltwHaz5UCnQx993WoPgRly8Eu41xfPNwJIMEUCIQCaDNhsb8s7bvVhJH5xL8k2bajyXzxdNLO7K7T/bFAXtgIgIwlbXupCkwlBfuw+eEoDburopaSw1820zqdhOOmpBiMBIQKWBDOnHNbRKiltwHaz5UCnQx993WoPgRly8Eu41xfPNwFBA+CQ+tJ/ob3esB2crUhOHtFWjkLSNmnqwOguWLKw+ZL/dPSnl1dPRlqABDEPlYxVcpBa9AHYEvXwHDaBZCw4gIMCSDBFAiEAqoEHSB/j5lnrJd/sh/reG6blx5s4E2/9y9vtZ4pbeFoCIAbWP+jDTFwU+gZOIm2PjA3cgjzqGZwXbqCzpWk+t5MnASEClgQzpxzW0SopbcB2s+VAp0Mffd1qD4EZcvBLuNcXzzcAAAAAAQEgWAIAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4ciAgKWBDOnHNbRKiltwHaz5UCnQx993WoPgRly8Eu41xfPN0cwRAIgfqUHFfqr+pNJTiNdLmos04GsImGGZ5Q1wVFC4oPMx2ECIGWrb4uCZHU79lW564TbVHwJYXiJfZXbSrnWiG2UE2xXAQEEFgAUpjzG2Nx2HUhFVZAI1EZ2Z/VWPdMAAQD9ZwMCAAAAAAEE7xgYEo0TNoaBiGiZ7ZuJoVcd8KKxkMjxHbohATR78K4EAAAAFxYAFKY8xtjcdh1IRVWQCNRGdmf1Vj3T/////+8YGBKNEzaGgYhome2biaFXHfCisZDI8R26IQE0e/CuBQAAABcWABSmPMbY3HYdSEVVkAjURnZn9VY90/////9Ez5qtJl5oxsdTJlNkws53Rk3N8TmUbWzZkzwyal9WmQAAAAAA/////4LAnbJnAzzH8PsojVx9wWUwM6yNXjvKgwdUfQ8CEL+sAgAAABcWABSmPMbY3HYdSEVVkAjURnZn9VY90/////8HsAQAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4ciAgAAAAAAACJRIPF+pE5+4fgDJyFvmtznshD3xhZ2+p7gp95auV9HqrnLwQsAAAAAAAAXqRSSFX0LpHlje+bnX7u5HqzE+zWxOIfoAwAAAAAAABepFH+LOf4kFYNcsrRSvrKVOmpQCAMoh1gCAAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HWAIAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4cMNAAAAAAAABepFMHIgkQhGoD4NIyPPtLT6IzH6o4PhwJIMEUCIQC+ysouJq6Crbl0nHWMw387YjFukDuRbjh44tjrYLFwgQIgMpLv7YQD9urcJkGxl49pBcggzmEP93+MHpl6q1lFFu0BIQKWBDOnHNbRKiltwHaz5UCnQx993WoPgRly8Eu41xfPNwJIMEUCIQCaDNhsb8s7bvVhJH5xL8k2bajyXzxdNLO7K7T/bFAXtgIgIwlbXupCkwlBfuw+eEoDburopaSw1820zqdhOOmpBiMBIQKWBDOnHNbRKiltwHaz5UCnQx993WoPgRly8Eu41xfPNwFBA+CQ+tJ/ob3esB2crUhOHtFWjkLSNmnqwOguWLKw+ZL/dPSnl1dPRlqABDEPlYxVcpBa9AHYEvXwHDaBZCw4gIMCSDBFAiEAqoEHSB/j5lnrJd/sh/reG6blx5s4E2/9y9vtZ4pbeFoCIAbWP+jDTFwU+gZOIm2PjA3cgjzqGZwXbqCzpWk+t5MnASEClgQzpxzW0SopbcB2s+VAp0Mffd1qD4EZcvBLuNcXzzcAAAAAAQEgWAIAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4ciAgKWBDOnHNbRKiltwHaz5UCnQx993WoPgRly8Eu41xfPN0cwRAIgeT2tvd8kRi2iBfiK2KIAlh7X6ieTm96pv80lJ+e8XhsCIAZzttnbrdeeUPRhWdZT2dGCcwU73TMs7rE3tDdqzv2oAQEEFgAUpjzG2Nx2HUhFVZAI1EZ2Z/VWPdMAAQErIgIAAAAAAAAiUSAfine0Ac3LjHgSyxNQ7HdRBeuM/vLnL2QP7yjR/bxxegEXIOWB7fOpSEcJMBcaPmdkkKj3lTo2mARMFLTXX/6ryIomAAEA/Y0BAgAAAAABArCxAYQ+bAWXljeI3Ev1WCHTcwzIG2X1iXbUQkqMctLRAAAAAAD/////NvBKwtlxV+EV16Rg/HMF35OzMTKs9kkcTZzuYcOXJSECAAAAFxYAFGDlgJlFG8++cV89OtoR2g3lSMs3/////wMiAgAAAAAAACJRIPF+pE5+4fgDJyFvmtznshD3xhZ2+p7gp95auV9HqrnLwTUAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4cDAm8AAAAAABepFJIVfQukeWN75udfu7kerMT7NbE4hwFA3GVFDIZl5o2hd5HOfoJ030MYL5TRaSlG4IowqdP9ODWig3JePXcHq8WFgQ5f/U5naylcU0Mc0mmD9EjEkDsXVwJHMEQCIDOLVjzG8Fd0cwK7QQrJ/MT0r4ND0XPbbTWFW3qIyvkDAiBHAe9Q2iO5YWQv29XAvw0EXJGxqRgcT7sLjhcBkAA2sAEhAzUo3Eyf0GLmPSqNX4suPDuDEq58HTxKQancTu+kIFwFAAAAAAEBIME1AAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HIgIClgQzpxzW0SopbcB2s+VAp0Mffd1qD4EZcvBLuNcXzzdHMEQCIBkJ+txvM0qEv1zODrX28G2TfhVEQNhE9vYq57DmdMvoAiBVrBF8FaYm9V9/LGSeLdlDGztwLWRY5P2cQ6oxUGB4UAEBBBYAFKY8xtjcdh1IRVWQCNRGdmf1Vj3TAAAAAAAAAAA=",
            "marketplaceId": "6e210197-3d24-40da-b6a3-07f7bfdf6d32",
            "takerPaymentAddress": "taker-payment-address",
            "takerOrdinalAddress": "taker-ordinal-address"
        };

        let postTransactionStub: sinon.SinonStub;
        let getTransactionStub: sinon.SinonStub
        let processOrderbookBroadcastStub: sinon.SinonStub
        let addInputToMonitorStub: sinon.SinonStub;
        let updateTradeHistoryStub: sinon.SinonStub;
        let getActiveOrBroadcastOrderbooksStub: sinon.SinonStub;
        let getTradeHistoriesByOrderIdsStub: sinon.SinonStub;
        beforeEach(() => {
            postTransactionStub = sinon.stub(esplora, 'postTransaction');
            getTransactionStub = sinon.stub(esplora, 'getTransaction');
            processOrderbookBroadcastStub = sinon.stub(supabase, 'processOrderbookBroadcast');
            addInputToMonitorStub = sinon.stub(transactionListener, 'addInputToMonitor');
            updateTradeHistoryStub = sinon.stub(supabase, 'updateTradeHistory');
            getActiveOrBroadcastOrderbooksStub = sinon.stub(supabase, 'getActiveOrBroadcastOrderbooks');
            getTradeHistoriesByOrderIdsStub = sinon.stub(supabase, 'getTradeHistoriesByOrderIds');
        });
        it('should successfully merge signed PSBT', async () => {
            // Simulate order data
            getActiveOrBroadcastOrderbooksStub.resolves({
                data: [{
                    id: 1,
                    psbt: { signed_psbt: "cHNidP8BAFMCAAAAARO7DaTTn6RqdEwKypkQdnwOH1U+DlfiXJSrK/YE3kDNAQAAAAD/////AS1MAAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HAAAAAAABAP1lAwIAAAAAAQS5O7FQpqclyQF6D9nPYYeJExrJ4yiJhE28MmgR2d19GwMAAAAXFgAUpjzG2Nx2HUhFVZAI1EZ2Z/VWPdP/////u5dhIpr1X9m00dUJCFSUdCODHHab5dWlNM32vxYeIBMDAAAAFxYAFKY8xtjcdh1IRVWQCNRGdmf1Vj3T/////4A+OzHMl9d8ccNJ+NXSYCBHQq5745RMqeStUQhdmvsTAAAAAAD/////uTuxUKanJckBeg/Zz2GHiRMayeMoiYRNvDJoEdndfRsFAAAAFxYAFKY8xtjcdh1IRVWQCNRGdmf1Vj3T/////wewBAAAAAAAABepFMHIgkQhGoD4NIyPPtLT6IzH6o4PhxAnAAAAAAAAIlEg8X6kTn7h+AMnIW+a3OeyEPfGFnb6nuCn3lq5X0equcvFOgAAAAAAABepFJIVfQukeWN75udfu7kerMT7NbE4h5ADAAAAAAAAF6kU672Rni1TJ4itLUAgBEAY23FsgtOHWAIAAAAAAAAXqRTByIJEIRqA+DSMjz7S0+iMx+qOD4dYAgAAAAAAABepFMHIgkQhGoD4NIyPPtLT6IzH6o4Ph/SzDAAAAAAAF6kUwciCRCEagPg0jI8+0tPojMfqjg+HAkcwRAIgfWioZwg3XRv4XuavtF2mMLkyxq+fDMSmrA2Avsiq/BUCICkVMGA2vv+SfLhwfCOGxkqw9aQV7Hd/Cblw0+21QZVpASEClgQzpxzW0SopbcB2s+VAp0Mffd1qD4EZcvBLuNcXzzcCSDBFAiEA7PAEMMpIIVNskonPFpMWfOZaeuIMMzixUSfWIdYP+oICIEjLkBHO4hpHX6oPL2ONaWcQcIJRNot4JM8z6mvOfjxOASEClgQzpxzW0SopbcB2s+VAp0Mffd1qD4EZcvBLuNcXzzcBQbcyvuBk94K1O2i5mbShmXaEvvaj6kPrKum8s9GhAl4pa2E+RfcAhXcKGiGQolpccxcNysqwAJ1G5Zz1z4MqrzuDAkcwRAIgd3ZE8IT57S8SsO92Ow5PYHnruCCTPiABu0hHAetKE/ECIGVL9MWx8FDdeLa7UF2aQ9igTATxpIYN6DENd8nhhOPgASEClgQzpxzW0SopbcB2s+VAp0Mffd1qD4EZcvBLuNcXzzcAAAAAAQErECcAAAAAAAAiUSDxfqROfuH4Aychb5rc57IQ98YWdvqe4KfeWrlfR6q5ywEDBIMAAAABE0H2gg30s06DlPQqdGsee4kWbzH4W7IKnmZzkeUav+gixWvoAw4x+eDJ2XM7+Bnu5xabpDy21xXj5TT6l36Os/H7gwEXIFlKSq9dpbFE0PprR5h9lmAp2JL7xK67IyFIU+iwU3AuAAA=" },
                    utxos: {
                        id: 2,
                        utxo: "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1"
                    },
                    index_in_maker_psbt: 0,
                    trade_history: [
                        {
                            status: TRADE_HISTORY_STATUS.initiated,
                            taker_payment: {
                                address: request.takerPaymentAddress
                            },
                            taker_ordinal: {
                                address: request.takerOrdinalAddress
                            }
                        }
                    ]
                }],
                error: null
            });
            getOrInsertAddressStub
                .onFirstCall().resolves(100)
                .onSecondCall().resolves(101);

            postTransactionStub.resolves("acbf10020f7d540783ca3b5e8dac333065c17d5c8d28fbf0c73c0367b29dc082");
            processOrderbookBroadcastStub.resolves(true);
            getTransactionStub.resolves({
                "fee": 38056
            });
            getRawTxHexStub.resolves("02000000000104bcd81714eeeb3a70bb165249b3559fd0660d9a92fa054f3c6c1f1af5adf9df12060000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffffbcd81714eeeb3a70bb165249b3559fd0660d9a92fa054f3c6c1f1af5adf9df12050000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff13bb0da4d39fa46a744c0aca9910767c0e1f553e0e57e25c94ab2bf604de40cd0100000000ffffffff500554818bfe6b36050e74c28479e45620ad8d2c19c101927e8230cc00b77f51070000001716001460e58099451bcfbe715f3d3ada11da0de548cb37ffffffff08b00400000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388710270000000000002251201f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a2d4c00000000000017a914c1c88244211a80f8348c8f3ed2d3e88cc7ea8e0f87560200000000000017a914396f45888a52c0ce1ff20f53576a8c36fb67c61787e60300000000000017a9147f8b39fe2415835cb2b452beb2953a6a5008032887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887580200000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b1388776604f000000000017a91492157d0ba479637be6e75fbbb91eacc4fb35b13887024730440220196283f461662f602a22eadbb9052456c7d3ab77bf069a0720f1a235815fea010220625b01336c7553225ef103fac529878186b00ff44cea8e23e28e28262f4f138c0121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050247304402206397fdc4222a522656c267e265f7eb39bba74a389f4952faffc179230bd4e4b402201f353a6540714fd23c94776960b9a2306d632c0e3a54abfc1f4b020dabf940880121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c050141f6820df4b34e8394f42a746b1e7b89166f31f85bb20a9e667391e51abfe822c56be8030e31f9e0c9d9733bf819eee7169ba43cb6d715e3e534fa977e8eb3f1fb8302473044022033b53b75ddd45cc7f83c58d861708ce275e3e96758bab6a06be32e9162d2bfed02204164c3a6836d48e463a6eb024d625a9279cdf2990604acd23dc740400a6cb2630121033528dc4c9fd062e63d2a8d5f8b2e3c3b8312ae7c1d3c4a41a9dc4eefa4205c0500000000");
            addInputToMonitorStub.resolves(true);
            updateTradeHistoryStub.resolves({ data: [] });
            const result = await marketplaceListing.mergeSignedPSBT(
                [request.id],
                request.signedPSBTBase64,
                request.marketplaceId,
                request.takerPaymentAddress,
                request.takerOrdinalAddress
            );
            expect(result).to.deep.equal({ txId: 'acbf10020f7d540783ca3b5e8dac333065c17d5c8d28fbf0c73c0367b29dc082' });
            expect(getActiveOrBroadcastOrderbooksStub.calledOnce).to.be.true;
            expect(getActiveOrBroadcastOrderbooksStub.calledOnceWithExactly(
                [request.id],
                request.marketplaceId,
                ORDERBOOK_TYPE.listing
            )).to.be.true;
            
            expect(getOrInsertAddressStub.calledTwice).to.be.true;
            expect(getOrInsertAddressStub.firstCall.args[0]).to.deep.equal(request.takerPaymentAddress);
            expect(getOrInsertAddressStub.secondCall.args[0]).to.deep.equal(request.takerOrdinalAddress);
        
            expect(postTransactionStub.calledOnce).to.be.true;
            expect(getTransactionStub.calledOnce).to.be.true;
            expect(getTransactionStub.calledOnceWithExactly("acbf10020f7d540783ca3b5e8dac333065c17d5c8d28fbf0c73c0367b29dc082")).to.be.true;
            expect(getRawTxHexStub.calledOnce).to.be.true;
            expect(getRawTxHexStub.calledOnceWithExactly("acbf10020f7d540783ca3b5e8dac333065c17d5c8d28fbf0c73c0367b29dc082")).to.be.true;
            expect(processOrderbookBroadcastStub.calledOnceWithExactly([request.id], 'acbf10020f7d540783ca3b5e8dac333065c17d5c8d28fbf0c73c0367b29dc082', ORDERBOOK_STATUS.broadcast, ORDERBOOK_TYPE.listing, 100, 101)).to.be.true;
            expect(addInputToMonitorStub.calledOnceWithExactly("c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1")).to.be.true;
            expect(updateTradeHistoryStub.calledOnceWithExactly(
                request.id,
                'acbf10020f7d540783ca3b5e8dac333065c17d5c8d28fbf0c73c0367b29dc082',
                { fee_rate: 63 }
            )).to.be.true;
        });
    });

    describe('fetchAndAttachExistingUtxoData', () => {
        let findSpecialRangesUtxosStub: sinon.SinonStub;
        const makerOrdinalAddress = "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea";
        const makerPaymentAddress = "2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx";
        beforeEach(() => {
            findSpecialRangesUtxosStub = sinon.stub(satScanner, 'findSpecialRangesUtxos');
        });

        it('should fetch and attach existing UTXO data', async () => {
            const utxos = [
                { utxo: 'e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0', price: 1500 },
                { utxo: 'c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1', price: 2500 }
            ];
            findSpecialRangesUtxosStub.resolves([]);
            getUtxoDetailsWithOrderbookStub.resolves({ data: null });
            
            getOutputStub
                .withArgs('e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0')
                .resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340i0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1421505156112849,
                                1421505156113395
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340",
                        "value": 546
                });
            
            getOutputStub
                .withArgs('c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1')
                .resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "7d9efbdca27407771be34cf574496de957803b8a128426a083c1c1eb58d7c5bci0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1049142595702075,
                                1049142595702621
                            ],
                            [
                                1364704142969982,
                                1364704142979436
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cb",
                        "spent": false,
                        "transaction": "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470",
                        "value": 10000
                });

            
            const result = await marketplaceListing.fetchAndAttachExistingUtxoData(utxos, makerOrdinalAddress, makerPaymentAddress);

            expect(result).to.have.lengthOf(2);
            if (Array.isArray(result)) {
                const [itemResult1, itemResult2] = result;
                expect(itemResult1).to.have.property('inscription');
                expect(itemResult1.inscription).to.deep.equal({
                    ids: ['e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340i0'],
                    address: 'tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea',
                    output: 'e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0',
                    value: 546,
                });
                expect(itemResult2).to.have.property('inscription');
                expect(itemResult2.inscription).to.deep.equal({
                    ids: ['7d9efbdca27407771be34cf574496de957803b8a128426a083c1c1eb58d7c5bci0'],
                    address: 'tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea',
                    output: 'c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1',
                    value: 10000,
                });
            }
            
            expect(findSpecialRangesUtxosStub.calledOnceWithExactly(
                [
                    "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0",
                    "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1",
                ]
            )).to.be.true;
            expect(getUtxoDetailsWithOrderbookStub.callCount).to.equal(2)
            expect(getUtxoDetailsWithOrderbookStub.firstCall.args[0]).to.deep.equal({ utxo: "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0" });
            expect(getUtxoDetailsWithOrderbookStub.secondCall.args[0]).to.deep.equal({ utxo: "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1" });
            expect(getOutputStub.callCount).to.equal(2)
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0");
            expect(getOutputStub.secondCall.args[0]).to.deep.equal("c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1");
        });

        it('should return an error if no inscriptions, runes, or special ranges found', async () => {
            const utxos = [
                { utxo: 'e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0', price: 1500 },
                { utxo: 'c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1', price: 2500 }
            ];
            // Set up the mock behavior
            findSpecialRangesUtxosStub.resolves([]);
            getUtxoDetailsWithOrderbookStub.resolves({ data: null });
            
            getOutputStub
                .withArgs('e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0')
                .resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1421505156112849,
                                1421505156113395
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340",
                        "value": 546
                });
            
            getOutputStub
                .withArgs('c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1')
                .resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1049142595702075,
                                1049142595702621
                            ],
                            [
                                1364704142969982,
                                1364704142979436
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cb",
                        "spent": false,
                        "transaction": "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470",
                        "value": 10000
                });


            // Call the method
            const result = await marketplaceListing.fetchAndAttachExistingUtxoData(utxos, makerOrdinalAddress, makerPaymentAddress)
            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("no inscriptions, runes, or special ranges found");

            expect(findSpecialRangesUtxosStub.calledOnceWithExactly(
                [
                    "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0",
                    "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1",
                ]
            )).to.be.true;
            expect(getUtxoDetailsWithOrderbookStub.firstCall.args[0]).to.deep.equal({ utxo: "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0" });
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0");
        });

        it('should return an error utxos already listed', async () => {
            const utxos = [
                { utxo: 'e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0', price: 1500 },
                { utxo: 'c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1', price: 2500 }
            ];
            // Set up the mock behavior
            findSpecialRangesUtxosStub.resolves([]);
            getUtxoDetailsWithOrderbookStub.onFirstCall().resolves({ data: null });
            getUtxoDetailsWithOrderbookStub.onSecondCall().resolves({
                data: {
                    "id": 1,
                    "utxo": "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1",
                    "orderbook": [{
                        "id": 1,
                        "utxo_id": 1,
                        "status": ORDERBOOK_STATUS.active
                    }]
                }
            });
            
            getOutputStub
                .withArgs('e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0')
                .resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340i0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1421505156112849,
                                1421505156113395
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 1f8a77b401cdcb8c7812cb1350ec775105eb8cfef2e72f640fef28d1fdbc717a",
                        "spent": false,
                        "transaction": "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340",
                        "value": 546
                });
            
            getOutputStub
                .withArgs('c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1')
                .resolves({
                        "address": "tb1pr7980dqpeh9cc7qjevf4pmrh2yz7hr877tnj7eq0au5drlduw9aq629zea",
                        "indexed": true,
                        "inscriptions": [
                            "7d9efbdca27407771be34cf574496de957803b8a128426a083c1c1eb58d7c5bci0"
                        ],
                        "runes": {},
                        "sat_ranges": [
                            [
                                1049142595702075,
                                1049142595702621
                            ],
                            [
                                1364704142969982,
                                1364704142979436
                            ]
                        ],
                        "script_pubkey": "OP_PUSHNUM_1 OP_PUSHBYTES_32 f17ea44e7ee1f80327216f9adce7b210f7c61676fa9ee0a7de5ab95f47aab9cb",
                        "spent": false,
                        "transaction": "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470",
                        "value": 10000
                });


            // Call the method
            const result = await marketplaceListing.fetchAndAttachExistingUtxoData(utxos, makerOrdinalAddress, makerPaymentAddress)
            expect(result).to.be.an('object');
            expect(result).to.be.an('object').that.has.property('error').that.equals("utxos already listed");

            expect(findSpecialRangesUtxosStub.calledOnceWithExactly(
                [
                    "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0",
                    "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1",
                ]
            )).to.be.true;
            expect(getUtxoDetailsWithOrderbookStub.callCount).to.equal(2)
            expect(getUtxoDetailsWithOrderbookStub.firstCall.args[0]).to.deep.equal({ utxo: "e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0" });
            expect(getUtxoDetailsWithOrderbookStub.secondCall.args[0]).to.deep.equal({ utxo: "c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1" });
            expect(getOutputStub.callCount).to.equal(2)
            expect(getOutputStub.firstCall.args[0]).to.deep.equal("e9d7089885da839c5fd22dd8ebb29dd24aaee9b9a22dffda22ee345f7a297340:0");
            expect(getOutputStub.secondCall.args[0]).to.deep.equal("c211c3cff9846a26a1f76596ce8a8eb1eaf207cbc0598b73880acd674afb8470:1");
        });
    });

    describe('#checkIfDummyUtxosExists()', () => {

        let findSpecialRangesUtxosStub: sinon.SinonStub;
        beforeEach(() => {
            findSpecialRangesUtxosStub = sinon.stub(satScanner, "findSpecialRangesUtxos");
        });

        afterEach(() => {
            sinon.restore();
        });

        it('should return true when dummy UTXOs exist', async () => {
            getAddressUtxosStub.resolves([
                {
                    "txid": "f913c23bb05684212c72c2d48dc70accf6f4ab01a7eae3312a530e3062a9acd9",
                    "vout": 2,
                    "status": {
                        "confirmed": true,
                        "block_height": 2810605,
                        "block_hash": "00000000000000c50ec4f5b09e1c35d38a616d19356d012eb6e18a21046f621d",
                        "block_time": 1714623863
                    },
                    "value": 70000,
                },
                {
                    "txid": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                    "vout": 2,
                    "status": {
                        "confirmed": true,
                        "block_height": 2810336,
                        "block_hash": "00000000000000c350cec25179001f1258f7bb45c4702de739cef8ae28e23749",
                        "block_time": 1714564755
                    },
                    "value": 600
                },
                {
                    "txid": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                    "vout": 0,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081551,
                        "block_hash": "000000000000002cf9e6f5d7197e59ac61224464d65ae4abeb90f6f1df21ef20",
                        "block_time": 1728388358
                    },
                    "value": 600
                }
            ]);

            getOutputStub.resolves({
                "inscriptions": {},
                "runes": {}
            });

            findSpecialRangesUtxosStub.resolves([]);

            const result = await marketplaceListing.checkIfDummyUtxosExists('takerPaymentAddress', 2);
            expect(result).to.deep.equal({
                paddingOutputsExist: true,
                requiredDummyOutputs: 2,
                additionalOutputsNeeded: 0
            });

            expect(getAddressUtxosStub.calledOnceWithExactly(
                'takerPaymentAddress'
            )).to.be.true;
        });
        
        it('should return false when dummy UTXOs exist but are not enough', async () => {
            getAddressUtxosStub.resolves([
                {
                    "txid": "f913c23bb05684212c72c2d48dc70accf6f4ab01a7eae3312a530e3062a9acd9",
                    "vout": 2,
                    "status": {
                        "confirmed": true,
                        "block_height": 2810605,
                        "block_hash": "00000000000000c50ec4f5b09e1c35d38a616d19356d012eb6e18a21046f621d",
                        "block_time": 1714623863
                    },
                    "value": 70000,
                },
                {
                    "txid": "d9acef5d0c1724fe9e5295e54654557c771b012fea2ba9d35e77cb25dc1ae4fb",
                    "vout": 2,
                    "status": {
                        "confirmed": true,
                        "block_height": 2810336,
                        "block_hash": "00000000000000c350cec25179001f1258f7bb45c4702de739cef8ae28e23749",
                        "block_time": 1714564755
                    },
                    "value": 600
                },
                {
                    "txid": "8a22d055b8ad8d26934beb03d4a92c06726b0b867462d4fd354b6dc48e16e3ff",
                    "vout": 0,
                    "status": {
                        "confirmed": true,
                        "block_height": 3081551,
                        "block_hash": "000000000000002cf9e6f5d7197e59ac61224464d65ae4abeb90f6f1df21ef20",
                        "block_time": 1728388358
                    },
                    "value": 600
                }
            ]);

            getOutputStub.resolves({
                "inscriptions": {},
                "runes": {}
            });

            findSpecialRangesUtxosStub.resolves([]);

            const result = await marketplaceListing.checkIfDummyUtxosExists('takerPaymentAddress', 3);
            expect(result).to.deep.equal({
                paddingOutputsExist: false,
                requiredDummyOutputs: 3,
                additionalOutputsNeeded: 1
            });

            expect(getAddressUtxosStub.calledOnceWithExactly(
                'takerPaymentAddress'
            )).to.be.true;
        });

        it('should return false when dummy UTXOs do not exist', async () => {
            getAddressUtxosStub.resolves([]);

            const result = await marketplaceListing.checkIfDummyUtxosExists('takerPaymentAddress', 2);
            console.log({result});
            expect(result).to.deep.equal({
                paddingOutputsExist: false,
                requiredDummyOutputs: 2,
                additionalOutputsNeeded: 2
            });

            expect(getAddressUtxosStub.calledOnceWithExactly(
                'takerPaymentAddress'
            )).to.be.true;
        });
    });      
});