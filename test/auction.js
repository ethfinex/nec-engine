const Engine = artifacts.require("./Engine.sol")
const NEC = artifacts.require("./SimpleNEC.sol")
const { logGasUsage, snapshot, restore, forceMine, moveForwardTime } = require('./helpers/util')

const BN = web3.utils.BN
const _1e18 = new BN('1000000000000000000')

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
    })

    it("...should see the multiplier decreasing with time", async () => {

        let multiplier = await engine.percentageMultiplier()
        assert.equal(multiplier.toString(), 200, "Did not start at 200%")
        await moveForwardTime(35 * 60 + 1)
        multiplier = await engine.percentageMultiplier()
        assert.equal(multiplier.toString(), 100, "Is not 100% half way through the period")
    })


})
