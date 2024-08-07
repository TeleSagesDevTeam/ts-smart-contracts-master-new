# Telesages Ecosystem Contracts

### Setup

You'll need node & npm to use this project. When you have them continue.
Once you have them install the dependencies with `npm i`

### Testing

The project includes tests to ensure correct funtionality. To run them execute
`npx hardhat test`

## Telesages Contract

### Deployment

- Store your private key in an environment variable called `EVM_DEPLOYER_KEY`
- Add your target network to `hardhat.config` (follow the example for mumbai testnet)
- Run `npx hardhat run .\scripts\deploy_telesages.ts --network {YOUR_NETWORK}`

### Verify source

contractAddress deployerAddress protocolFeeWallet protocolFee subjectFee


### Usage notes

The MultiPriceParam is always divided by 1 ether (10^18). This is intended to allow decimal values as parameter. it does not apply to the FlatPriceParam.

## SAGEStaking Contract

### Deployment

- Store your private key in an environment variable called `EVM_DEPLOYER_KEY`
- Add your target network to `hardhat.config` (follow the example for mumbai testnet)
- Fill all the empty fields in `.\scripts\deploy_staking.ts`
- Run `npx hardhat run .\scripts\deploy_staking.ts --network {YOUR_NETWORK}`

### Rerouting treasuries

The two treasuries

- https://etherscan.io/address/0x9355ac76b64265d2d1cf0131a747a94b46c569ec
- https://etherscan.io/address/0x1c6c12fcbd5596a9809e89bd1f4545deb3f2decf

need to be updated to split funds accordingly.
To do so it is ncessary to call the

```
function setReceivers(Receiver[] memory _sageReceivers, Receiver[] memory _ethReceivers) public onlyRole(DEFAULT_ADMIN_ROLE)
```

function on either one. This call must be sent from the deployer address.
Each receiver is a struct

```
struct Receiver {
    uint256 share;
    address receiver;
    bool doCallback;
}
```

The sum of all shares must equal 10000. Hence configure it to:

- Share 2000 with new staking collector
- Share 2000 with new lp collector
- Share 6000 with team wallet

From here push the funds accumulated in the collectors to staking / LP on a semi-regular basis.

### Upgrades

The contract is NOT upgradeable by default
