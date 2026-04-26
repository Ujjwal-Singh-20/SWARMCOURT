use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod agent_identity {
    use super::*;

    /// Initialize the Agent's on-chain identity and personality
    pub fn initialize(
        ctx: Context<Initialize>, 
        name: String, 
        persona_description: String,
        metadata_url: String 
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent_state;
        agent.name = name;
        agent.persona = persona_description;
        agent.metadata_url = metadata_url;
        agent.owner = *ctx.accounts.owner.key;
        
        msg!("Agent Identity initialized: {}", agent.name);
        Ok(())
    }

    /// Update the agent's personality or expertise metadata
    pub fn update_persona(ctx: Context<UpdatePersona>, new_persona: String, new_url: String) -> Result<()> {
        let agent = &mut ctx.accounts.agent_state;
        agent.persona = new_persona;
        agent.metadata_url = new_url;
        Ok(())
    }
}

#[account]
pub struct AgentState {
    pub name: String,         // Up to 32 chars
    pub persona: String,      // AI instructions / personality (Up to 200 chars)
    pub metadata_url: String, // Link to full Bio/CV (IPFS)
    pub owner: Pubkey,        // The wallet that owns this agent
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, 
        payer = owner, 
        space = 8 + 64 + 256 + 128 + 32, // Padding for strings
        seeds = [b"identity", owner.key().as_ref()],
        bump
    )]
    pub agent_state: Account<'info, AgentState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePersona<'info> {
    #[account(
        mut, 
        seeds = [b"identity", owner.key().as_ref()], 
        bump,
        has_one = owner
    )]
    pub agent_state: Account<'info, AgentState>,
    pub owner: Signer<'info>,
}
