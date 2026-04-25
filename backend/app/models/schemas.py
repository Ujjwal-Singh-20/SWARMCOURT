"""
SwarmCourt API — Pydantic Models / Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional


# ═══════════════════════════════════════════════════════════
# Request Models
# ═══════════════════════════════════════════════════════════

class OpenCaseRequest(BaseModel):
    """Request to start a debate after the on-chain OpenCase tx is confirmed."""
    case_id: int = Field(..., description="The u64 case ID from the on-chain transaction")
    task: str = Field(..., max_length=250, description="The debate task/question (max 250 chars)")
    jury_tier: int = Field(..., ge=0, le=2, description="0=Circuit(3), 1=Appellate(5), 2=Supreme(7)")
    topology: int = Field(..., ge=0, le=1, description="0=Debate, 1=Generator-Validator")
    bounty_amount: float = Field(..., gt=0, description="Bounty in SOL")
    tx_signature: str = Field(..., description="The confirmed OpenCase transaction signature")
    option_a: str = Field(default="Option A", description="Label for choice 0")
    option_b: str = Field(default="Option B", description="Label for choice 1")


class FeedbackRequest(BaseModel):
    """Request to submit user feedback for a finalized case."""
    case_id: int = Field(..., description="The case ID")
    satisfied: bool = Field(..., description="Whether the user is satisfied with the outcome")
    rating: Optional[int] = Field(default=None, ge=1, le=5, description="Rating 1-5 (for Gen-Val topology)")


class SyncFeedbackRequest(BaseModel):
    """Request to sync feedback and trigger reputation updates after user signs tx."""
    case_id: int = Field(..., description="The case ID")
    tx_signature: str = Field(..., description="The confirmed feedback transaction signature")


# ═══════════════════════════════════════════════════════════
# Response Models
# ═══════════════════════════════════════════════════════════

class AgentReputation(BaseModel):
    """On-chain agent reputation data."""
    agent: str = Field(..., description="Agent wallet public key")
    score: int = Field(..., description="Reputation score")
    total_cases: int = Field(..., description="Total cases participated")
    correct_votes: int = Field(..., description="Number of correct votes")
    accuracy: float = Field(default=0.0, description="Accuracy percentage")
    stake_slashed: float = Field(default=0.0, description="Total SOL slashed")
    vault_balance: float = Field(default=0.0, description="Current vault balance in SOL")


class AgentListResponse(BaseModel):
    """Response for the global agent list."""
    agents: list[AgentReputation]
    total: int


class CaseData(BaseModel):
    """On-chain case data."""
    case_id: int
    creator: str
    task: str
    state: int  # 0=Open, 1=Committed, 2=Voting, 3=Finalized
    topology: int
    jury_tier: int
    generator: Optional[str] = None
    validators: list[str] = []
    agents: list[str] = []
    transcript_cid: str = ""
    votes: list[dict] = []
    final_choice: int = 0
    has_final: bool = False
    has_feedback: bool = False
    user_satisfied: bool = False
    user_rating: Optional[int] = None
    bounty: float = 0.0
    created_at: int = 0


class CaseResponse(BaseModel):
    """Wrapper response for case data."""
    success: bool
    case: Optional[CaseData] = None
    message: str = ""


class TranscriptResponse(BaseModel):
    """IPFS transcript data."""
    success: bool
    transcript: Optional[dict] = None
    message: str = ""


class FeedbackResponse(BaseModel):
    """Response after submitting feedback."""
    success: bool
    feedback_tx: str = ""
    reputation_updates: list[dict] = []
    message: str = ""


class OpenCaseResponse(BaseModel):
    """Response after initiating a debate."""
    success: bool
    case_id: int
    message: str = ""
    ws_url: str = ""
    task: str = ""


class HistoryItem(BaseModel):
    """Minimal case data for history list."""
    id: str
    task: str
    state: int
    topology: int
    has_feedback: bool
    bounty: float
    date: int

class HistoryResponse(BaseModel):
    """Response for user case history."""
    success: bool
    cases: list[HistoryItem]
    message: str = ""

# ═══════════════════════════════════════════════════════════
# WebSocket Message Models
# ═══════════════════════════════════════════════════════════

class WSMessage(BaseModel):
    """WebSocket message sent to the frontend during a debate."""
    type: str = Field(..., description="Message type: utterance, vote, status, error, complete")
    agent: str = ""
    content: str = ""
    round: int = 0
    role: str = ""  # generator, validator, debater, summarizer
    data: Optional[dict] = None
