const Engine = artifacts.require("./Engine.sol")
const NEC = artifacts.require("./SimpleNEC.sol")
const { logGasUsage, blockTime, snapshot, restore, forceMine, moveForwardTime } = require('./helpers/util')
const catchRevert = require("./helpers/exceptions").catchRevert;

const BN = web3.utils.BN
const _1e18 = new BN('1000000000000000000')
let initSnap

contract('Engine', async (accounts) => {

    let engine, nec

    before(async () => {
        nec = await NEC.deployed()
        engine = await Engine.deployed()

        await nec.mint(accounts[0], _1e18.mul(new BN(10000)))
        await nec.mint(accounts[1], _1e18.mul(new BN(10000)))
        const minttx = await nec.mint(accounts[2], _1e18.mul(new BN(100000)))
        logGasUsage('minting NEC', minttx)
    })

    it("...should be able to see accounts have NEC balances", async () => {

        const balance = await nec.balanceOf(accounts[0])
        assert.equal(balance.toString(), _1e18.mul(new BN(10000)).toString(), "Tokens were not minted")
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

    it("...should have a defined engine price and there should be liquid ether", async () => {

        liquidEth = await engine.liquidEther.call()
        assert.equal(liquidEth.toString(), _1e18.toString(), 'Thaw did trigger successfully')
        enginePrice = await engine.enginePrice()
        assert.equal(enginePrice.toString(), 2 * 1000 * (10 ** 18) / 4, 'Engine price was not initialised')
    })

    it("...should be possible for frozen ether to be thawed and then purchased", async () => {
        await restore(initSnap)
        initSnap = await snapshot()
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

    it("...should correctly return time and price of next price change", async () => {
        const nextStep = await engine.getNextPriceChange()
        assert.equal(nextStep.newPrice.toString(), 195, 'Not got next price change')
        console.log('NOT YET TESTING NEXT TIME')
        // TODO: Check next time of change
        // const now = new BN(Date.now() / 1000)
        // const nextExpectedChangeTime = now.add(new BN(60*60/35))
        // assert.equal(nextStep.nextChangeTimeSeconds.toString(), nextExpectedChangeTime.toString(), 'Not got next price change')
    })

    it("...should be possible to complete two rounds of auctions, and buy all ETH", async () => {
      await restore(initSnap)
      initSnap = await snapshot()
      const multiplier = await engine.percentageMultiplier()
      assert.equal(multiplier.toString(), 200, "Did not reset to 200%")
      liquidEth = await engine.liquidEther.call()
      assert.equal(liquidEth.toString(), 0, 'Did not reset evm to snapshot')

      await engine.payFeesInEther({from: accounts[0], value: _1e18.mul(new BN(10))})
      frozenEth = await engine.frozenEther.call()
      assert.equal(frozenEth.toString(), _1e18.mul(new BN(10)).toString(), 'Funds not paid in successfully')

      await moveForwardTime((60 * 60) + 1)

      await engine.thaw()
      liquidEth = await engine.liquidEther.call()
      assert.equal(liquidEth.toString(), _1e18.mul(new BN(10)).toString(), 'Funds not thawed successfully')

      await nec.approve(engine.address, _1e18.mul(new BN(500)))
      necburntx = await engine.sellAndBurnNec(_1e18.mul(new BN(500)))
      logGasUsage('burning NEC', necburntx)

      // Expecting initial price to be 500 NEC for 1 ETH
      liquidEth = await engine.liquidEther.call()
      assert.equal(liquidEth.toString(), _1e18.mul(new BN(9)).toString(), 'Funds not thawed successfully')

      await moveForwardTime((35 * 60) + 1)

      await nec.approve(engine.address, _1e18.mul(new BN(2250)), {from: accounts[1]})
      necburntx = await engine.sellAndBurnNec(_1e18.mul(new BN(2250)), {from: accounts[1]})
      logGasUsage('burning NEC', necburntx)

      // Expecting initial price to be 500 NEC for 1 ETH
      liquidEth = await engine.liquidEther.call()
      assert.equal(liquidEth.toString(), _1e18.mul(new BN(0)).toString(), 'Funds not thawed successfully')

      await engine.payFeesInEther({from: accounts[1], value: _1e18.mul(new BN(11))})
      await moveForwardTime((25 * 60))
      await engine.thaw()
      liquidEth = await engine.liquidEther.call()
      assert.equal(liquidEth.toString(), _1e18.mul(new BN(11)).toString(), 'Funds not thawed successfully')

      enginePrice = await engine.enginePrice()
      assert.equal(enginePrice.toString(), 500 * (10 ** 18), 'Engine price did not start at double last round')

      await nec.approve(engine.address, _1e18.mul(new BN(5500)), {from: accounts[2]})
      necburntx = await engine.sellAndBurnNec(_1e18.mul(new BN(5500)), {from: accounts[2]})

      liquidEth = await engine.liquidEther.call()
      assert.equal(liquidEth.toString(), _1e18.mul(new BN(0)).toString(), 'Funds not thawed successfully')

      await engine.payFeesInEther({from: accounts[1], value: _1e18.mul(new BN(1))})
      await moveForwardTime((60 * 60) + 1)
      await engine.thaw()
      enginePrice = await engine.enginePrice()
      assert.equal(enginePrice.toString(), 1000 * (10 ** 18), 'Engine price did not start at double last round')
    })

    it("...should not be possible to thaw before delay has passed", async () => {
      await restore(initSnap)
      initSnap = await snapshot()

      await engine.payFeesInEther({from: accounts[0], value: _1e18})
      await moveForwardTime((10 * 60) + 1)
      await catchRevert(engine.thaw())
    })

    it("...should not be possible to thaw when there is no frozen ether", async () => {
      await restore(initSnap)
      initSnap = await snapshot()

      await moveForwardTime((60 * 60) + 1)
      await catchRevert(engine.thaw())
    })

    it("...should not be possible to burn NEC if have no balance", async () => {
      await restore(initSnap)
      initSnap = await snapshot()

      await engine.payFeesInEther({from: accounts[5], value: _1e18.mul(new BN(20))})
      await moveForwardTime((60 * 60) + 1)
      await engine.thaw()

      await catchRevert(engine.sellAndBurnNec(100, {from: accounts[4]}))
    })

    it("...should not be possible to burn NEC if have insufficient balance", async () => {
      await restore(initSnap)
      initSnap = await snapshot()

      await engine.payFeesInEther({from: accounts[5], value: _1e18.mul(new BN(20))})
      await moveForwardTime((60 * 60) + 1)
      await engine.thaw()

      await nec.approve(engine.address, _1e18.mul(new BN(10001)))
      await catchRevert(engine.sellAndBurnNec(_1e18.mul(new BN(10001)), {from: accounts[0]}))
    })

    it("...should not be possible to burn NEC if have not approved", async () => {
      await restore(initSnap)
      initSnap = await snapshot()

      await engine.payFeesInEther({from: accounts[5], value: _1e18.mul(new BN(20))})
      await moveForwardTime((60 * 60) + 1)
      await engine.thaw()

      await catchRevert(engine.sellAndBurnNec(_1e18.mul(new BN(10000)), {from: accounts[0]}))
    })

    it("...should be possible to predict the details for the next auction if no sales in current round", async () => {
      await restore(initSnap)
      initSnap = await snapshot()

      await engine.payFeesInEther({from: accounts[5], value: _1e18.mul(new BN(1))})
      await moveForwardTime((60 * 60) + 1)
      await engine.thaw()
      await engine.payFeesInEther({from: accounts[5], value: _1e18.mul(new BN(20))})

      const nextAuction = await engine.getNextAuction()
      assert.equal(nextAuction.nextStartTimeSeconds.toString(), await blockTime() + 60 * 60, 'Incorrect calculation for next auction time');
      assert.equal(nextAuction.predictedEthAvailable.toString(), _1e18.mul(new BN(20)).toString(), 'Incorrect calculation for eth in auction');
      assert.equal(nextAuction.predictedStartingPrice.toString(), _1e18.mul(new BN(250)).div(new BN(4)).toString(), 'Incorrect calculation for next price (assuming no trades)');
    })

    it("...should be possible to predict the details for the next auction if sale made in current round", async () => {
      await restore(initSnap)
      initSnap = await snapshot()

      await engine.payFeesInEther({from: accounts[5], value: _1e18.mul(new BN(1))})
      await moveForwardTime((60 * 60) + 1)
      await engine.thaw()
      await moveForwardTime((10 * 60) + 1)
      await nec.approve(engine.address, _1e18.mul(new BN(20)))
      await engine.sellAndBurnNec(_1e18.mul(new BN(20)), {from: accounts[0]})
      await engine.payFeesInEther({from: accounts[5], value: _1e18.mul(new BN(20))})

      const nextAuction = await engine.getNextAuction()
      assert.equal(nextAuction.nextStartTimeSeconds.toString(), await blockTime() + 50 * 60 - 1, 'Incorrect calculation for next auction time');
      assert.equal(nextAuction.predictedEthAvailable.toString(), _1e18.mul(new BN(20)).toString(), 'Incorrect calculation for eth in auction');
      assert.equal(nextAuction.predictedStartingPrice.toString(), _1e18.mul(new BN(250)).mul(new BN(175)).mul(new BN(2)).div(new BN(100)).toString(), 'Incorrect calculation for next price (assuming no trades)');
    })

    // TODO:
    // Check all events emitted, and include price in burn event
    // Check ETH received as result of transaction called, and NEC balance reduced
    // Add more tests for all negative cases / failure modes


})
