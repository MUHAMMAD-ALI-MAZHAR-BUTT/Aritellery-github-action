import sinon, { SinonFakeTimers } from "sinon";
import TransactionListener from "../model/transactionListener";
import Supabase from "../model/supabase";
import Esplora from "../api/esplora";
import { Database, Tables } from '../database.types';
import { SupabaseClient } from '@supabase/supabase-js';
import { ORDERBOOK_STATUS } from "../conf/constants";
import { toSupabaseResponse } from './helpers';
import { expect } from "chai";
import { Transaction, Block } from 'bitcoinjs-lib';
import WebhookSender from '../api/webhookSender';

describe("TransactionListener", () => {
    const platformFeeAddress = 'mock';
    let transactionListener: TransactionListener;
    let supabase: Supabase;
    let esplora: Esplora;
    let updateOrderbookByIdsSpy: any;
    let webhookSender: WebhookSender;
    let clock: SinonFakeTimers;

    beforeEach(() => {
        esplora = new Esplora('https://mock.com');
        supabase = new Supabase({ supabase:{} as SupabaseClient<Database>, platformFeeAddress });
        webhookSender = new WebhookSender({orderWebhookUrl: 'https://mock.com/webhook', svixAuthToken: 'mock-secret'});
        transactionListener = new TransactionListener({ supabase, esplora, webhookSender });
        updateOrderbookByIdsSpy = sinon.stub(supabase, 'updateOrderbookByIds');
        const originalTime = new Date("2025-02-19T12:05:24.346Z");
        clock = sinon.useFakeTimers(originalTime.getTime());
    });

    afterEach(() => {
        clock.restore();
        sinon.restore();
    });

    describe('#loadMonitoringInputsFromDB()', () => {
        it('should load monitoring inputs from the database', async () => {
            sinon.stub(supabase, 'getMonitoringUTXOs').resolves([{ utxo: 'mock1' }, { utxo: 'mock2' }]);

            await transactionListener.loadMonitoringInputsFromDB();

            expect(transactionListener.monitoringInputs.size).to.equal(2);
            expect(transactionListener.monitoringInputs.get('mock1')).to.equal(true);
            expect(transactionListener.monitoringInputs.get('mock2')).to.equal(true);
        });
    });

    describe('#checkForSnipeTransactions()', () => {
        const utxo = '3d1278d7fb2818edc2a9f905c0278626cf35512628a69bb5fd015a4436471160:1';
        let tx: Transaction;
        let sendOrderWebhookStub: sinon.SinonStub;
        let monitoringInputDetectedSpy: sinon.SinonStub;
        
        beforeEach(() => {
            tx = Transaction.fromHex('0200000000010440dca9697a7b8ea4681d4b644352a5a6c80c3994b42e731562168d06f6b50e140400000017160014f3e1c4a136626f629a33d8a73cd7451298705f8fffffffff40dca9697a7b8ea4681d4b644352a5a6c80c3994b42e731562168d06f6b50e140500000017160014f3e1c4a136626f629a33d8a73cd7451298705f8fffffffff60114736445a01fdb59ba628265135cf268627c005f9a9c2ed1828fbd778123d0100000000ffffffff40dca9697a7b8ea4681d4b644352a5a6c80c3994b42e731562168d06f6b50e140600000017160014f3e1c4a136626f629a33d8a73cd7451298705f8fffffffff07b00400000000000017a9143502dc23854783300cc42cb151dd2491ce7d6e1787102700000000000022512044ddb479c1fe1e5c6ca9c2d1b477fcf7eb024e57f5aee10f2507f0c450c47da8bd4d00000000000017a914aa8afe728cb7bf65cd00c8d654cc877f6d01119f87580200000000000017a9143502dc23854783300cc42cb151dd2491ce7d6e1787580200000000000017a9143502dc23854783300cc42cb151dd2491ce7d6e1787bdd901000000000017a9143502dc23854783300cc42cb151dd2491ce7d6e17878e0100000000000016001403f50fc232687d6c5ed3c0f5cc166abb8d64465502483045022100c082c5bdd9a955a5007cbb3192a1e7341da2fcbea5a79f05abd05660f255030602200c0a8d08a3454e337a044d92930997f7f4f82a15336ff9d4254c1ef2baebc8890121037e94c8d3b5e285443bb3aa0136cce155c8de8e187ce4ad7ec425f74f3ac0688a02473044022010bda6e335d3277e81b73e19f97ba184f5e2514ff1951ea4e91b93a651cdd77f02201320af514aabc675beabc6e1661e22317136281d02f8d96718cf7d93f36bc3cb0121037e94c8d3b5e285443bb3aa0136cce155c8de8e187ce4ad7ec425f74f3ac0688a0141ae25ac6de49656529c36b47023aecf571364e3091161d9109cd67c63c925cfe5270a1140cbf4128ca55b355ee95a9142bd1631f092d67627b5c3faf9caface8a83024830450221008c491f7c232dbb7290cdb86374bc4f4b18014ea0a3abe1ad2d870bde90a65c2102207e7c553ac2a4e604ba207378ca74ec138241fe9526d7546e22b7aa14378972c00121037e94c8d3b5e285443bb3aa0136cce155c8de8e187ce4ad7ec425f74f3ac0688a00000000');
            sendOrderWebhookStub = sinon.stub(webhookSender, 'sendOrderWebhook').resolves(true);
        });

        it('should send a confirmed webhook when tx confrms', async () => {
            transactionListener.addInputToMonitor(utxo);
            sinon.stub(transactionListener, 'calculateTxFeeRate').resolves(50);
            monitoringInputDetectedSpy = sinon.stub(supabase, 'monitoringInputDetected').resolves([{ order_ids: [1], is_snipe: false }]);

            
            await transactionListener.checkForSnipeTransactions(tx, true);

            expect(sendOrderWebhookStub.calledOnce).to.be.true;
            const webhookCall = sendOrderWebhookStub.getCall(0);
            expect(webhookCall.args[1]).to.equal('order_confirmed');
            expect(webhookCall.args[2]).to.deep.equal({
                eventType: 'order_confirmed',
                txid: 'a05790882d700908967ac9c51a13484eb8255bc962a567ecf9b2b2c8f230fee4',
                orderIds: [1]
            });
            expect(transactionListener.monitoringInputs.size).to.equal(0);
        });


        it('should send a sniped webhook when tx is sniped', async () => {
            transactionListener.addInputToMonitor(utxo);
            sinon.stub(transactionListener, 'calculateTxFeeRate').resolves(50);
            monitoringInputDetectedSpy = sinon.stub(supabase, 'monitoringInputDetected').resolves([{ order_ids: [1], is_snipe: true }]);

            
            await transactionListener.checkForSnipeTransactions(tx, false);

            expect(sendOrderWebhookStub.calledOnce).to.be.true;
            const webhookCall = sendOrderWebhookStub.getCall(0);
            expect(webhookCall.args[1]).to.equal('order_sniped');
            expect(webhookCall.args[2]).to.deep.equal({
                eventType: 'order_sniped',
                txid: 'a05790882d700908967ac9c51a13484eb8255bc962a567ecf9b2b2c8f230fee4',
                orderIds: [1]
            });
            expect(transactionListener.monitoringInputs.size).to.equal(1);
        });
    });

    describe('#checkBlock()', () => {
        const buffer = Buffer.from('0100000006e533fd1ada86391f3f6c343204b0d278d4aaec1c0b20aa27ba0300000000006abbb3eb3d733a9fe18967fd7d4c117e4ccbbac5bec4d910d900b3ae0793e77f54241b4d4c86041b4089cc9b0c01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff07044c86041b010dffffffff0100f2052a01000000434104b27f7e9475ccf5d9a431cb86d665b8302c140144ec2397fce792f4a4e7765fecf8128534eaa71df04f93c74676ae8279195128a1506ebf7379d23dab8fca0f63ac000000000100000001d992e5a888a86d4c7a6a69167a4728ee69497509740fc5f456a24528c340219a000000008b483045022100f0519bdc9282ff476da1323b8ef7ffe33f495c1a8d52cc522b437022d83f6a230220159b61d197fbae01b4a66622a23bc3f1def65d5fa24efd5c26fa872f3a246b8e014104839f9023296a1fabb133140128ca2709f6818c7d099491690bd8ac0fd55279def6a2ceb6ab7b5e4a71889b6e739f09509565eec789e86886f6f936fa42097adeffffffff02000fe208010000001976a914948c765a6914d43f2a7ac177da2c2f6b52de3d7c88ac00e32321000000001976a9140c34f4e29ab5a615d5ea28d4817f12b137d62ed588ac0000000001000000059daf0abe7a92618546a9dbcfd65869b6178c66ec21ccfda878c1175979cfd9ef000000004a493046022100c2f7f25be5de6ce88ac3c1a519514379e91f39b31ddff279a3db0b1a229b708b022100b29efbdbd9837cc6a6c7318aa4900ed7e4d65662c34d1622a2035a3a5534a99a01ffffffffd516330ebdf075948da56db13d22632a4fb941122df2884397dda45d451acefb0000000048473044022051243debe6d4f2b433bee0cee78c5c4073ead0e3bde54296dbed6176e128659c022044417bfe16f44eb7b6eb0cdf077b9ce972a332e15395c09ca5e4f602958d266101ffffffffe1f5aa33961227b3c344e57179417ce01b7ccd421117fe2336289b70489883f900000000484730440220593252bb992ce3c85baf28d6e3aa32065816271d2c822398fe7ee28a856bc943022066d429dd5025d3c86fd8fd8a58e183a844bd94aa312cefe00388f57c85b0ca3201ffffffffe207e83718129505e6a7484831442f668164ae659fddb82e9e5421a081fb90d50000000049483045022067cf27eb733e5bcae412a586b25a74417c237161a084167c2a0b439abfebdcb2022100efcc6baa6824b4c5205aa967e0b76d31abf89e738d4b6b014e788c9a8cccaf0c01ffffffffe23b8d9d80a9e9d977fab3c94dbe37befee63822443c3ec5ae5a713ede66c3940000000049483045022020f2eb35036666b1debe0d1d2e77a36d5d9c4e96c1dba23f5100f193dbf524790221008ce79bc1321fb4357c6daee818038d41544749127751726e46b2b320c8b565a201ffffffff0200ba1dd2050000001976a914366a27645806e817a6cd40bc869bdad92fe5509188ac40420f00000000001976a914ee8bd501094a7d5ca318da2506de35e1cb025ddc88ac0000000001000000010abad2dc0c9b4b1dbb023077da513f81e5a71788d8680fca98ef1c37356c459c000000004a493046022100a894e521c87b3dbe23007079db4ac2896e9e791f8b57317ba6c0d99a7becd27a022100bc40981393eafeb33e89079f857c728701a9af4523c3f857cd96a500f240780901ffffffff024026ee22010000001976a914d28f9cefb58c1f7a5f97aa6b79047585f58fbd4388acc0cb1707000000001976a9142229481696e417aa5f51ad751d8cd4c6a669e4fe88ac000000000100000001f66d89b3649e0b18d84db056930676cb81c0168042fc4324c3682e252ea9410d0000000048473044022038e0b55b37c9253bfeda59c76c0134530f91fb586d6eb21738a77a984f370a44022048d4d477aaf97ef9c8275bbc5cb19b9c8a0e9b1f9fdafdd39bc85bf6c2f04a4d01ffffffff024041a523010000001976a914955f70ac8792b48b7bd52b15413bd8500ecf32c888ac00f36f06000000001976a91486116d15f3dbb23a2b58346f36e6ec2d867eba2b88ac00000000010000000126c384984f63446a4f2be8dd6531ba9837bd5f2c3d37403c5f51fb9192ee754e010000008b48304502210083af8324456f052ff1b2597ff0e6a8cce8b006e379a410cf781be7874a2691c2022072259e2f7292960dea0ffc361bbad0b861f719beb8550476f22ce0f82c023449014104f3ed46a81cba02af0593e8572a9130adb0d348b538c829ccaaf8e6075b78439b2746a76891ce7ba71abbcbb7ca76e8a220782738a6789562827c1065b0ce911dffffffff02c0dd9107000000001976a91463d4dd1b29d95ed601512b487bfc1c49d84d057988ac00a0491a010000001976a91465746bef92511df7b34abf71c162efb7ae353de388ac0000000001000000011b56cf3aab3286d582c055a42af3a911ee08423f276da702bb67f1222ac1a5b6000000008c4930460221009e9fba682e162c9627b96b7df272006a727988680b956c61baff869f0907b8fb022100a9c19adc7c36144bafe526630783845e5cb9554d30d3edfb56f0740274d507f30141046e0efbfac7b1615ad553a6f097615bc63b7cdb3b8e1cb3263b619ba63740012f51c7c5b09390e3577e377b7537e61226e315f95f926444fc5e5f2978c112e448ffffffff02c0072b11010000001976a914b73e9e01933351ca076faf8e0d94dd58079d0b1f88ac80b63908000000001976a9141aca0bdf0d2cee63db19aa4a484f45a4e26a880c88ac000000000100000001251b187504ea873b2c3915fad401f7a7734cc13567e0417708e86294a29f4f68010000008b4830450221009bef423141ed1ae60d0a5bcaa57b1673fc96001f0d4e105535cca817ba5a7724022037c399bd30374f22481ffc81327cfca4951c7264b227f765fcd6a429f3d9d2080141044d0d1b4f194c31a73dbce41c42b4b3946849117c5bb320467e014bad3b1532f28a9a1568ba7108f188e7823b6e618e91d974306701379a27b9339e646e156e7bffffffff02c00fd103010000001976a914ef7f5d9e1bc6ed68cfe0b1db9d8f09cef0f3ba4a88ac004dd208000000001976a914c22420641cea028c9e06c4d9104c1646f8b1769088ac0000000001000000013486dd5f0a2f3efcc04f64cb03872c021f98ee39f514747ce5336b874bbe47a7010000008b48304502201cadddc2838598fee7dc35a12b340c6bde8b389f7bfd19a1252a17c4b5ed2d71022100c1a251bbecb14b058a8bd77f65de87e51c47e95904f4c0e9d52eddc21c1415ac014104fe7df86d58aafa9246ca6fd30c905714533c25f700e2329b8ecec8aa52083b844baa3a8acd5d6b9732dcb39079bb56ba2711a3580dec824955fce0596a460c11ffffffff02c011f6e1000000001976a91490fac83c9adde91d670dde8755f8b475ab9e427d88acc0f9df15000000001976a91437f691b3e8ee5dcb56c2e31af4c80caa2df3b09b88ac00000000010000000170016bd1274b795b262f32a53003a4714b22b62f9057adf5fbe6ed939003b5190100000089463043022061456499582170a94d6b54308f792e37dad28bf0ed7aa61021f0301d2774d378021f4224b33f707efd810a01dd34ea86d6069cd599cc435513a0eef8c83c137bf7014104a2c95d6b98e745448eb45ed0ba95cf24dd7c3b16386e1028e24a0358ee4afc33e2f0199139853edaf32845d8a42254c75f7dc8add3286c682c650fbd93f0a4a1ffffffff02001bd2b7000000001976a9141b11c6acaa5223013f3a3240fdb024ecd9f8135488ac8023ad18000000001976a914ada27ca87bbaa1ee6fb1cb61bb0a29baaf6da2c988ac000000000100000001c8ff91f031ec6a5aba4baee6549e61dd01f26f61b70e2f1574f24cd680f464ad000000008b48304502210082235e21a2300022738dabb8e1bbd9d19cfb1e7ab8c30a23b0afbb8d178abcf3022024bf68e256c534ddfaf966bf908deb944305596f7bdcc38d69acad7f9c868724014104174f9eef1157dc1ad5eac198250b70d1c3b04b2fca12ad1483f07358486f02909b088bbc83f4de55f767f6cdf9d424aa02b5eeaffa08394d39b717895fc08d0affffffff0200ea3b43000000001976a914fb32df708f0610901f6d1b6df8c9c368fe0d981c88ac800f1777000000001976a914462c501c70fb996d15ac0771e7fc8d3ca3f7201888ac000000000100000001c67323867de802402e780a70e0deba3c708c4d87497e17590afee9c321f1c680010000008a473044022042734b25f54845d662e6499b75ff8529ff47f42fd224498a9f752d212326dbfa0220523e4b7b570bbb1f3af02baa2c04ea8eb7b0fccb1522cced130b666ae9a9d014014104b5a23b922949877e9eaf7512897ed091958e2e8cf05b0d0eb9064e7976043fde6023b4e2c188b7e38ef94eec6845dc4933f5e8635f1f6a3702290956aa9e284bffffffff0280041838030000001976a91436e5884215f7d3044be5d37bdd8c987d9d942c8488ac404b4c00000000001976a91460085d6838f8a44a21a0de56ff963cfa6242a96188ac00000000', 'hex');

        it('should check for snipe transactions in a block', async () => {
            const block = Block.fromBuffer(buffer);

            const spy = sinon.stub(transactionListener, 'checkForSnipeTransactions').resolves([]);

            await transactionListener.checkBlock(buffer);

            expect(spy.callCount).to.equal(12);
        });
    });
});
