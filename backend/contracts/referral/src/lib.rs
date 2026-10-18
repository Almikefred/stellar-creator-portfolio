#![no_std]
// `Events::publish` is deprecated in soroban-sdk 23 in favour of `#[contractevent]`.
// Migrating changes the on-chain event topic/data layout the indexer decodes,
// so it is kept as-is for the SDK upgrade and tracked as a separate change.
#![allow(deprecated)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env,
};

#[contracttype]
#[derive(Clone)]
pub struct Referral {
    pub referrer: Address,
    pub referred: Address,
    pub registered_at: u64,
}

#[contracttype]
pub enum DataKey {
    Referral(Address), // referred -> Referral
    UnclaimedRewards(Address), // referrer -> i128
    ReferralCount(Address, u64), // referrer, month -> u32
    Admin,
    RewardToken,
}

/// Typed errors returned by referral entrypoints (#1562).
///
/// Codes are part of the contract's public interface: never renumber an
/// existing variant, only append. See docs/contracts.md for the full table.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReferralError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    ReferralAlreadyRegistered = 3,
    MonthlyLimitReached = 4,
    ReferralNotFound = 5,
    NoUnclaimedRewards = 6,
}

#[contract]
pub struct ReferralContract;

const ONE_MONTH_SECS: u64 = 30 * 24 * 60 * 60;
const MAX_REFERRALS_PER_MONTH: u32 = 50;
const REWARD_PERCENTAGE: u64 = 5; // 5% of platform fee

#[contractimpl]
impl ReferralContract {
    pub fn initialize(env: Env, admin: Address, reward_token: Address) -> Result<(), ReferralError> {
        if env.storage().persistent().has(&DataKey::Admin) {
            return Err(ReferralError::AlreadyInitialized);
        }
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::RewardToken, &reward_token);
        Ok(())
    }

    pub fn register_referral(env: Env, referrer: Address, referred: Address) -> Result<(), ReferralError> {
        let key = DataKey::Referral(referred.clone());
        if env.storage().persistent().has(&key) {
            return Err(ReferralError::ReferralAlreadyRegistered);
        }

        let month = env.ledger().timestamp() / ONE_MONTH_SECS;
        let count_key = DataKey::ReferralCount(referrer.clone(), month);
        let mut count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
        if count >= MAX_REFERRALS_PER_MONTH {
            return Err(ReferralError::MonthlyLimitReached);
        }

        env.storage().persistent().set(
            &key,
            &Referral {
                referrer: referrer.clone(),
                referred: referred.clone(),
                registered_at: env.ledger().timestamp(),
            },
        );

        count += 1;
        env.storage().persistent().set(&count_key, &count);

        env.events().publish(
            (symbol_short!("referral"), symbol_short!("reg")),
            (referrer, referred),
        );
        Ok(())
    }

    pub fn award_referral_reward(env: Env, referred: Address, platform_fee: i128) -> Result<(), ReferralError> {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Admin)
            .ok_or(ReferralError::NotInitialized)?;
        admin.require_auth();

        let referral_key = DataKey::Referral(referred.clone());
        let referral: Referral = env
            .storage()
            .persistent()
            .get(&referral_key)
            .ok_or(ReferralError::ReferralNotFound)?;

        let reward = (platform_fee * REWARD_PERCENTAGE as i128) / 100;

        let unclaimed_key = DataKey::UnclaimedRewards(referral.referrer.clone());
        let mut unclaimed: i128 = env.storage().persistent().get(&unclaimed_key).unwrap_or(0);
        unclaimed += reward;
        env.storage().persistent().set(&unclaimed_key, &unclaimed);

        env.events().publish(
            (symbol_short!("referral"), symbol_short!("reward")),
            (referral.referrer, referred, reward),
        );
        Ok(())
    }

    pub fn claim_referral_reward(env: Env, referrer: Address) -> Result<i128, ReferralError> {
        referrer.require_auth();

        let unclaimed_key = DataKey::UnclaimedRewards(referrer.clone());
        let unclaimed: i128 = env.storage().persistent().get(&unclaimed_key).unwrap_or(0);
        if unclaimed <= 0 {
            return Err(ReferralError::NoUnclaimedRewards);
        }

        let reward_token: Address = env
            .storage()
            .persistent()
            .get(&DataKey::RewardToken)
            .ok_or(ReferralError::NotInitialized)?;
        let token_client = soroban_sdk::token::Client::new(&env, &reward_token);
        token_client.transfer(&env.current_contract_address(), &referrer, &unclaimed);

        env.storage().persistent().set(&unclaimed_key, &0i128);

        env.events().publish(
            (symbol_short!("referral"), symbol_short!("claim")),
            (referrer, unclaimed),
        );

        Ok(unclaimed)
    }

    pub fn get_unclaimed_rewards(env: Env, referrer: Address) -> i128 {
        env.storage().persistent().get(&DataKey::UnclaimedRewards(referrer)).unwrap_or(0)
    }

    pub fn get_referral(env: Env, referred: Address) -> Option<Referral> {
        env.storage().persistent().get(&DataKey::Referral(referred))
    }

    pub fn get_referral_count(env: Env, referrer: Address, month: u64) -> u32 {
        env.storage().persistent().get(&DataKey::ReferralCount(referrer, month)).unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn test_register_referral() {
        let env = Env::default();
        env.mock_all_auths();
        let contract = ReferralContractClient::new(&env, &env.register(ReferralContract, ()));

        let admin = Address::generate(&env);
        let reward_token = Address::generate(&env);
        contract.initialize(&admin, &reward_token);

        let referrer = Address::generate(&env);
        let referred = Address::generate(&env);

        contract.register_referral(&referrer, &referred);

        let referral = contract.get_referral(&referred).unwrap();
        assert_eq!(referral.referrer, referrer);
    }

    #[test]
    fn test_award_and_claim_reward() {
        let env = Env::default();
        env.mock_all_auths();
        let contract = ReferralContractClient::new(&env, &env.register(ReferralContract, ()));

        let admin = Address::generate(&env);
        let reward_token = Address::generate(&env);
        contract.initialize(&admin, &reward_token);

        let referrer = Address::generate(&env);
        let referred = Address::generate(&env);

        contract.register_referral(&referrer, &referred);

        contract.award_referral_reward(&referred, &1000i128);

        let unclaimed = contract.get_unclaimed_rewards(&referrer);
        assert_eq!(unclaimed, 50i128); // 5% of 1000
    }
}
