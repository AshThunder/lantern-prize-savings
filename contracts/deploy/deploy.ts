import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const SEPOLIA_USDT = "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0";
const SEPOLIA_CUSDT = "0x4E7B06D78965594eB5EF5414c357ca21E1554491";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const chainId = await hre.getChainId();

  let asset = SEPOLIA_USDT;
  let prizeToken = SEPOLIA_CUSDT;
  let wrapper = SEPOLIA_CUSDT;
  let drawPeriod = 60;

  if (chainId === "31337") {
    const usdt = await deploy("MockUSDT", { from: deployer, log: true });
    const cUsdt = await deploy("MockConfidentialUSDT", {
      from: deployer,
      args: [usdt.address],
      log: true,
    });
    asset = usdt.address;
    prizeToken = cUsdt.address;
    wrapper = cUsdt.address;
    drawPeriod = 0;
  }

  const forwarder = await deploy("LanternForwarder", { from: deployer, log: true });

  const pool = await deploy("ConfidentialPrizePool", {
    from: deployer,
    args: [deployer, prizeToken, asset, wrapper, drawPeriod, forwarder.address],
    log: true,
  });

  const nft = await deploy("MockDuckNFT", {
    from: deployer,
    args: [forwarder.address],
    log: true,
  });
  const hook = await deploy("PrizeToNftHolderHook", {
    from: deployer,
    args: [nft.address, pool.address],
    log: true,
  });

  console.log(`ConfidentialPrizePool: ${pool.address}`);
  console.log(`LanternForwarder: ${forwarder.address}`);
  console.log(`MockDuckNFT: ${nft.address}`);
  console.log(`PrizeToNftHolderHook: ${hook.address}`);
  console.log(`asset: ${asset}`);
  console.log(`prizeToken: ${prizeToken}`);
};

export default func;
func.id = "deploy_lantern_running_twab_v1";
func.tags = ["Lantern"];
