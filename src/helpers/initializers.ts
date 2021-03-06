import { Address, Bytes, ethereum, log } from '@graphprotocol/graph-ts';
import {
  AToken,
  SToken,
  VToken,
  PriceOracle,
  PriceOracleAsset,
  Reserve,
  User,
  UserReserve,
  ReserveParamsHistoryItem,
  ReserveConfigurationHistoryItem,
  Referrer,
  ChainlinkAggregator,
  ContractToPoolMapping,
  Protocol,
} from '../../generated/schema';
import {
  PRICE_ORACLE_ASSET_PLATFORM_SIMPLE,
  PRICE_ORACLE_ASSET_TYPE_SIMPLE,
  zeroAddress,
  zeroBD,
  zeroBI,
} from '../utils/converters';
import { getAtokenId, getReserveId, getUserReserveId } from '../utils/id-generation';

export function getProtocol(): Protocol {
  let protocolId = '1';
  let protocol = Protocol.load(protocolId);
  if (protocol == null) {
    protocol = new Protocol(protocolId);
    protocol.save();
  }
  return protocol as Protocol;
}

export function getPoolByContract(event: ethereum.Event): string {
  let contractAddress = event.address.toHexString();
  let contractToPoolMapping = ContractToPoolMapping.load(contractAddress);
  if (contractToPoolMapping === null) {
    throw new Error(contractAddress + 'is not registered in ContractToPoolMapping');
  }
  return contractToPoolMapping.pool;
}

export function getOrInitUser(address: Address): User {
  let user = User.load(address.toHexString());
  if (!user) {
    user = new User(address.toHexString());
    user.borrowedReservesCount = 0;
    user.save();
  }
  return user as User;
}

export function getOrInitUserReserve(
  _user: Address,
  _underlyingAsset: Address,
  event: ethereum.Event
): UserReserve {
  let poolId = getPoolByContract(event);
  let userReserveId = getUserReserveId(_user, _underlyingAsset, poolId);
  let userReserve = UserReserve.load(userReserveId);
  if (userReserve === null) {
    userReserve = new UserReserve(userReserveId);
    userReserve.pool = poolId;
    userReserve.usageAsCollateralEnabledOnUser = false; // TODO: reminder that we changed to false. check other places where it may effect
    userReserve.scaledATokenBalance = zeroBI();
    userReserve.scaledVariableDebt = zeroBI();
    userReserve.principalStableDebt = zeroBI();
    userReserve.currentATokenBalance = zeroBI();
    userReserve.currentVariableDebt = zeroBI();
    userReserve.currentStableDebt = zeroBI();
    userReserve.stableBorrowRate = zeroBI();
    userReserve.oldStableBorrowRate = zeroBI();
    userReserve.currentTotalDebt = zeroBI();
    userReserve.variableBorrowIndex = zeroBI();
    userReserve.lastUpdateTimestamp = 0;
    userReserve.liquidityRate = zeroBI();
    userReserve.stableBorrowLastUpdateTimestamp = 0;

    let user = getOrInitUser(_user);
    userReserve.user = user.id;

    let poolReserve = getOrInitReserve(_underlyingAsset, event);
    userReserve.reserve = poolReserve.id;
  }
  return userReserve as UserReserve;
}

export function getOrInitReserve(underlyingAsset: Address, event: ethereum.Event): Reserve {
  let poolId = getPoolByContract(event);
  let reserveId = getReserveId(underlyingAsset, poolId);
  let reserve = Reserve.load(reserveId);

  if (reserve === null) {
    reserve = new Reserve(reserveId);
    reserve.underlyingAsset = underlyingAsset;
    reserve.pool = poolId;
    reserve.paused = false;
    reserve.symbol = '';
    reserve.name = '';
    reserve.decimals = 0;
    reserve.usageAsCollateralEnabled = false;
    reserve.borrowingEnabled = false;
    reserve.stableBorrowRateEnabled = false;
    reserve.isActive = false;
    reserve.isFrozen = false;
    reserve.baseLTVasCollateral = zeroBI();
    reserve.reserveLiquidationThreshold = zeroBI();
    reserve.reserveLiquidationBonus = zeroBI();
    reserve.reserveInterestRateStrategy = new Bytes(1);
    reserve.baseVariableBorrowRate = zeroBI();
    reserve.optimalUtilisationRate = zeroBI();
    reserve.variableRateSlope1 = zeroBI();
    reserve.variableRateSlope2 = zeroBI();
    reserve.stableRateSlope1 = zeroBI();
    reserve.stableRateSlope2 = zeroBI();
    reserve.utilizationRate = zeroBD();
    reserve.totalLiquidity = zeroBI();
    reserve.totalATokenSupply = zeroBI();
    reserve.totalLiquidityAsCollateral = zeroBI();
    reserve.availableLiquidity = zeroBI();
    reserve.liquidityRate = zeroBI();
    reserve.variableBorrowRate = zeroBI();
    reserve.stableBorrowRate = zeroBI();
    reserve.averageStableRate = zeroBI(); // TODO: where do i get this?
    reserve.liquidityIndex = zeroBI();
    reserve.variableBorrowIndex = zeroBI();
    reserve.reserveFactor = zeroBI(); // TODO: is default 0?
    reserve.aToken = zeroAddress().toHexString();
    reserve.vToken = zeroAddress().toHexString();
    reserve.sToken = zeroAddress().toHexString();

    reserve.totalScaledVariableDebt = zeroBI();
    reserve.totalCurrentVariableDebt = zeroBI();
    reserve.totalPrincipalStableDebt = zeroBI();
    reserve.totalDeposits = zeroBI();

    reserve.lifetimePrincipalStableDebt = zeroBI();
    reserve.lifetimeScaledVariableDebt = zeroBI();
    reserve.lifetimeCurrentVariableDebt = zeroBI();

    reserve.lifetimeLiquidity = zeroBI();
    reserve.lifetimeBorrows = zeroBI();
    reserve.lifetimeRepayments = zeroBI();
    reserve.lifetimeWithdrawals = zeroBI();
    reserve.lifetimeLiquidated = zeroBI();
    reserve.lifetimeFlashLoans = zeroBI();
    reserve.lifetimeFlashLoanPremium = zeroBI();

    reserve.stableDebtLastUpdateTimestamp = 0;
    reserve.lastUpdateTimestamp = 0;

    reserve.lifetimeReserveFactorAccrued = zeroBI();
    reserve.lifetimeDepositorsInterestEarned = zeroBI();
    // reserve.lifetimeStableDebFeeCollected = zeroBI();
    // reserve.lifetimeVariableDebtFeeCollected = zeroBI();

    let priceOracleAsset = getPriceOracleAsset(underlyingAsset.toHexString());
    if (!priceOracleAsset.lastUpdateTimestamp) {
      priceOracleAsset.save();
    }
    reserve.price = priceOracleAsset.id;
    // TODO: think about AToken
  }
  return reserve as Reserve;
}

export function getChainlinkAggregator(id: string): ChainlinkAggregator {
  let chainlinkAggregator = ChainlinkAggregator.load(id);
  if (!chainlinkAggregator) {
    chainlinkAggregator = new ChainlinkAggregator(id);
    chainlinkAggregator.oracleAsset = '';
  }
  return chainlinkAggregator as ChainlinkAggregator;
}

export function getPriceOracleAsset(id: string): PriceOracleAsset {
  let priceOracleReserve = PriceOracleAsset.load(id);
  if (!priceOracleReserve) {
    priceOracleReserve = new PriceOracleAsset(id);
    priceOracleReserve.oracle = getOrInitPriceOracle().id;
    priceOracleReserve.priceSource = zeroAddress();
    priceOracleReserve.dependentAssets = [];
    priceOracleReserve.type = PRICE_ORACLE_ASSET_TYPE_SIMPLE;
    priceOracleReserve.platform = PRICE_ORACLE_ASSET_PLATFORM_SIMPLE;
    priceOracleReserve.priceInEth = zeroBI();
    priceOracleReserve.isFallbackRequired = false;
    priceOracleReserve.lastUpdateTimestamp = 0;
    priceOracleReserve.fromChainlinkSourcesRegistry = false;
    priceOracleReserve.save();
  }
  return priceOracleReserve as PriceOracleAsset;
}

export function getOrInitPriceOracle(): PriceOracle {
  let priceOracle = PriceOracle.load('1');
  if (!priceOracle) {
    priceOracle = new PriceOracle('1');
    priceOracle.proxyPriceProvider = zeroAddress();
    priceOracle.usdPriceEth = zeroBI();
    priceOracle.usdPriceEthMainSource = zeroAddress();
    priceOracle.usdPriceEthFallbackRequired = false;
    priceOracle.fallbackPriceOracle = zeroAddress();
    priceOracle.tokensWithFallback = [];
    priceOracle.lastUpdateTimestamp = 0;
    priceOracle.usdDependentAssets = [];
    priceOracle.save();
  }
  return priceOracle as PriceOracle;
}

export function getOrInitSToken(sTokenAddress: Address): SToken {
  let sTokenId = getAtokenId(sTokenAddress);
  let sToken = SToken.load(sTokenId);
  if (!sToken) {
    sToken = new SToken(sTokenId);
    sToken.underlyingAssetAddress = new Bytes(1);
    sToken.tokenContractImpl = zeroAddress();
    sToken.pool = '';
    sToken.underlyingAssetDecimals = 18;
  }
  return sToken as SToken;
}

export function getOrInitVToken(vTokenAddress: Address): VToken {
  let vTokenId = getAtokenId(vTokenAddress);
  let vToken = VToken.load(vTokenId);
  if (!vToken) {
    vToken = new VToken(vTokenId);
    vToken.underlyingAssetAddress = new Bytes(1);
    vToken.tokenContractImpl = zeroAddress();
    vToken.pool = '';
    vToken.underlyingAssetDecimals = 18;
  }
  return vToken as VToken;
}

export function getOrInitAToken(aTokenAddress: Address): AToken {
  let aTokenId = getAtokenId(aTokenAddress);
  let aToken = AToken.load(aTokenId);
  if (!aToken) {
    aToken = new AToken(aTokenId);
    aToken.underlyingAssetAddress = new Bytes(1);
    aToken.tokenContractImpl = zeroAddress();
    aToken.pool = '';
    aToken.underlyingAssetDecimals = 18;
  }
  return aToken as AToken;
}

export function getOrInitReserveParamsHistoryItem(
  id: Bytes,
  reserve: Reserve
): ReserveParamsHistoryItem {
  let itemId = id.toHexString() + reserve.id;
  let reserveParamsHistoryItem = ReserveParamsHistoryItem.load(itemId);
  if (!reserveParamsHistoryItem) {
    reserveParamsHistoryItem = new ReserveParamsHistoryItem(itemId);
    reserveParamsHistoryItem.variableBorrowRate = zeroBI();
    reserveParamsHistoryItem.variableBorrowIndex = zeroBI();
    reserveParamsHistoryItem.utilizationRate = zeroBD();
    reserveParamsHistoryItem.stableBorrowRate = zeroBI();
    reserveParamsHistoryItem.averageStableBorrowRate = zeroBI();
    reserveParamsHistoryItem.liquidityIndex = zeroBI();
    reserveParamsHistoryItem.liquidityRate = zeroBI();
    reserveParamsHistoryItem.totalLiquidity = zeroBI();
    reserveParamsHistoryItem.totalATokenSupply = zeroBI();
    reserveParamsHistoryItem.availableLiquidity = zeroBI();
    reserveParamsHistoryItem.totalLiquidityAsCollateral = zeroBI();
    reserveParamsHistoryItem.priceInEth = zeroBI();
    reserveParamsHistoryItem.priceInUsd = zeroBD();
    reserveParamsHistoryItem.reserve = reserve.id;
    reserveParamsHistoryItem.totalScaledVariableDebt = zeroBI();
    reserveParamsHistoryItem.totalCurrentVariableDebt = zeroBI();
    reserveParamsHistoryItem.totalPrincipalStableDebt = zeroBI();
    reserveParamsHistoryItem.lifetimePrincipalStableDebt = zeroBI();
    reserveParamsHistoryItem.lifetimeScaledVariableDebt = zeroBI();
    reserveParamsHistoryItem.lifetimeCurrentVariableDebt = zeroBI();
    reserveParamsHistoryItem.lifetimeFlashLoans = zeroBI();
    reserveParamsHistoryItem.lifetimeFlashLoanPremium = zeroBI();
    reserveParamsHistoryItem.lifetimeReserveFactorAccrued = zeroBI();
    reserveParamsHistoryItem.lifetimeDepositorsInterestEarned = zeroBI();
    // reserveParamsHistoryItem.lifetimeStableDebFeeCollected = zeroBI();
    // reserveParamsHistoryItem.lifetimeVariableDebtFeeCollected = zeroBI();
  }
  return reserveParamsHistoryItem as ReserveParamsHistoryItem;
}

export function getOrInitReserveConfigurationHistoryItem(
  id: Bytes,
  reserve: Reserve
): ReserveConfigurationHistoryItem {
  let reserveConfigurationHistoryItem = ReserveConfigurationHistoryItem.load(id.toHexString());
  if (!reserveConfigurationHistoryItem) {
    reserveConfigurationHistoryItem = new ReserveConfigurationHistoryItem(id.toHexString());
    reserveConfigurationHistoryItem.usageAsCollateralEnabled = false;
    reserveConfigurationHistoryItem.borrowingEnabled = false;
    reserveConfigurationHistoryItem.stableBorrowRateEnabled = false;
    reserveConfigurationHistoryItem.isActive = false;
    reserveConfigurationHistoryItem.reserveInterestRateStrategy = new Bytes(1);
    reserveConfigurationHistoryItem.baseLTVasCollateral = zeroBI();
    reserveConfigurationHistoryItem.reserveLiquidationThreshold = zeroBI();
    reserveConfigurationHistoryItem.reserveLiquidationBonus = zeroBI();
    reserveConfigurationHistoryItem.reserve = reserve.id;
  }
  return reserveConfigurationHistoryItem as ReserveConfigurationHistoryItem;
}

// @ts-ignore
export function getOrInitReferrer(id: i32): Referrer {
  let referrer = Referrer.load(id.toString());
  if (!referrer) {
    referrer = new Referrer(id.toString());
    referrer.save();
  }
  return referrer as Referrer;
}

export function createMapContractToPool(_contractAddress: Address, pool: string): void {
  let contractAddress = _contractAddress.toHexString();
  let contractToPoolMapping = ContractToPoolMapping.load(contractAddress);

  if (contractToPoolMapping) {
    log.error('contract {} is already registered in the protocol', [contractAddress]);
    throw new Error(contractAddress + 'is already registered in the protocol');
  }
  contractToPoolMapping = new ContractToPoolMapping(contractAddress);
  contractToPoolMapping.pool = pool;
  contractToPoolMapping.save();
}
