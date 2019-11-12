const Engine = artifacts.require("./Engine.sol")
const NEC = artifacts.require("./SimpleNEC.sol")
const { logGasUsage, snapshot, restore, forceMine, moveForwardTime } = require('./helpers/util')

const BN = web3.utils.BN
const _1e18 = new BN('1000000000000000000')
let initSnap

contract('Engine', async (accounts) => {

    let engine, nec

    before(async () => {
        nec = await NEC.deployed()
        engine = await Engine.deployed()

        await nec.mint(accounts[0], _1e18.mul(new BN(1000)))
        await nec.mint(accounts[1], _1e18.mul(new BN(1000)))
        const minttx = await nec.mint(accounts[2], _1e18.mul(new BN(1000)))
        logGasUsage('minting NEC', minttx)
    })

    it("...should be able to see accounts have NEC balances", async () => {

        const balance = await nec.balanceOf(accounts[0])
        assert.equal(balance.toString(), _1e18.mul(new BN(1000)).toString(), "Tokens were not minted")
        initSnap = await snapshot()
    })

    it("...should see the multiplier decreasing with time", async () => {

        let multiplier = await engine.percentageMultiplier()
        assert.equal(multiplier.toString(), 200, "Did not start at 200%")
        await moveForwardTime((35 * 60) + 1)
        multiplier = await engine.percentageMultiplier()
        assert.equal(multiplier.toString(), 100, "Is not 100% at half way through the period")
        await moveForwardTime(25 * 60)
        multiplier = await engine.percentageMultiplier()
        assert.equal(multiplier.toString(), 25, "Is not 25% at the end of the period")
    })

    it("...should reset multiplier if calling thaw", async () => {

        feestx = await engine.payFeesInEther({from: accounts[0], value: _1e18})
        logGasUsage('sending fees in ETH', feestx)
        thawtx = await engine.thaw()
        logGasUsage('thawing ETH', thawtx)
        const multiplier = await engine.percentageMultiplier()
        assert.equal(multiplier.toString(), 200, "Did not reset to 200%")
    })

    it("...engine price should be defined and there should be liquid ether", async () => {

        liquidEth = await engine.liquidEther.call()
        assert.equal(liquidEth.toString(), _1e18.toString(), 'Thaw did trigger successfully')
        enginePrice = await engine.enginePrice()
        assert.equal(enginePrice.toString(), 2 * 1000 / 4, 'Engine price was not initialised')
    })

    it("...frozen ether can be thawed and then purchased", async () => {
        await restore(initSnap)
        const multiplier = await engine.percentageMultiplier()
        assert.equal(multiplier.toString(), 200, "Did not reset to 200%")
        await engine.payFeesInEther({from: accounts[0], value: _1e18.mul(new BN(10))})
        frozenEth = await engine.frozenEther.call()
        assert.equal(frozenEth.toString(), _1e18.mul(new BN(10)).toString(), 'Funds not paid in successfully')
        await moveForwardTime((60 * 60) + 1)
        await engine.thaw()
        liquidEth = await engine.liquidEther.call()
        assert.equal(liquidEth.toString(), _1e18.mul(new BN(10)).toString(), 'Funds not thawed successfully')


        await nec.approve(engine.address, _1e18)
        necburntx = await engine.sellAndBurnNec(_1e18)
        logGasUsage('burning NEC', necburntx)
    })

    // TODO: Check burn event emitted, and include price in burn event
    // Check ETH received as result of transaction called, and NEC balance reduced 


})
