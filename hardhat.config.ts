import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";

function getNetworks() {
  const networks: any = {
    hardhat: {
		debug: true
	},
  };

  if (process.env.EVM_DEPLOYER_KEY != null) {
    networks.arbitrumSepolia = {
      url: "https://arbitrum-sepolia.blockpi.network/v1/rpc/public",
      accounts: [process.env.EVM_DEPLOYER_KEY],
    };
  }

  return networks;
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs:  2000,
        details: {
          yul: true,
        }
      },
    },
  },
  networks: getNetworks(),
  etherscan: {
    apiKey: {
      arbitrumSepolia: "",
      polygon_mumbai: "",
    },
	customChains: [
		{
			network: "arbitrumSepolia",
			chainId: 421614,
			urls: {
				apiURL: "https://api-sepolia.arbiscan.io/api",
				browserURL: "https://sepolia.arbiscan.io/"
			}
		}
	]
  },
};

export default config;
