"""Portfolio use cases."""
from typing import List, Dict
from uuid import UUID
from decimal import Decimal
import logging

from ..dto.portfolio_dto import (
    CreatePortfolioRequest,
    UpdatePortfolioRequest,
    AddPositionRequest,
    UpdatePositionRequest,
    PortfolioResponse,
    PortfolioSummaryResponse,
    PositionResponse,
)
from ...domain.entities.portfolio import Portfolio, PortfolioPosition
from ...domain.repositories.portfolio_repository import PortfolioRepository
from ...domain.repositories.financial_instrument_repository import FinancialInstrumentRepository
from ...domain.repositories.price_data_repository import PriceDataRepository
from ...domain.exceptions.portfolio_exceptions import (
    PortfolioNotFoundException,
    PositionNotFoundException,
    PortfolioAccessDeniedException,
)
from ...domain.exceptions.base import EntityNotFoundException

logger = logging.getLogger(__name__)


class PortfolioUseCases:
    """Portfolio-related use cases."""
    
    def __init__(
        self,
        portfolio_repository: PortfolioRepository,
        instrument_repository: FinancialInstrumentRepository,
        price_data_repository: PriceDataRepository,
    ):
        self.portfolio_repository = portfolio_repository
        self.instrument_repository = instrument_repository
        self.price_data_repository = price_data_repository
    
    async def create_portfolio(
        self, 
        user_id: UUID, 
        request: CreatePortfolioRequest
    ) -> PortfolioResponse:
        """Create a new portfolio."""
        logger.info(f"Creating portfolio for user {user_id}: {request.name}")
        
        # Check if portfolio with same name exists for user
        if await self.portfolio_repository.exists_by_name_and_user(request.name, user_id):
            raise ValueError(f"Portfolio with name '{request.name}' already exists")
        
        # Create portfolio entity
        portfolio = Portfolio.create(
            user_id=user_id,
            name=request.name,
            description=request.description,
            base_currency=request.base_currency,
        )
        
        # Save portfolio
        created_portfolio = await self.portfolio_repository.create(portfolio)
        
        logger.info(f"Portfolio created successfully: {created_portfolio.id}")
        return await self._map_to_response(created_portfolio)
    
    async def get_portfolio(self, portfolio_id: UUID, user_id: UUID) -> PortfolioResponse:
        """Get portfolio by ID."""
        logger.info(f"Getting portfolio {portfolio_id} for user {user_id}")
        
        portfolio = await self.portfolio_repository.get_by_id(portfolio_id)
        if not portfolio:
            raise PortfolioNotFoundException(str(portfolio_id))
        
        # Check ownership
        if portfolio.user_id != user_id:
            raise PortfolioAccessDeniedException(str(portfolio_id), str(user_id))
        
        return await self._map_to_response(portfolio)
    
    async def get_user_portfolios(self, user_id: UUID) -> List[PortfolioSummaryResponse]:
        """Get all portfolios for a user."""
        logger.info(f"Getting portfolios for user: {user_id}")
        
        portfolios = await self.portfolio_repository.get_by_user_id(user_id)
        
        # Get latest prices for all instruments
        instrument_ids = []
        for portfolio in portfolios:
            instrument_ids.extend([pos.instrument_id for pos in portfolio.positions])
        
        if instrument_ids:
            latest_prices = await self.price_data_repository.get_latest_for_instruments(
                list(set(instrument_ids))
            )
            price_map = {price.instrument_id: price.close_price for price in latest_prices}
            
            # Update portfolio positions with latest prices
            for portfolio in portfolios:
                portfolio.update_prices(price_map)
        
        return [self._map_to_summary_response(portfolio) for portfolio in portfolios]
    
    async def update_portfolio(
        self,
        portfolio_id: UUID,
        user_id: UUID,
        request: UpdatePortfolioRequest,
    ) -> PortfolioResponse:
        """Update portfolio information."""
        logger.info(f"Updating portfolio {portfolio_id} for user {user_id}")
        
        portfolio = await self.portfolio_repository.get_by_id(portfolio_id)
        if not portfolio:
            raise PortfolioNotFoundException(str(portfolio_id))
        
        # Check ownership
        if portfolio.user_id != user_id:
            raise PortfolioAccessDeniedException(str(portfolio_id), str(user_id))
        
        # Update portfolio fields
        if request.name:
            portfolio.name = request.name
        if request.description is not None:
            portfolio.description = request.description
        
        # Save updated portfolio
        updated_portfolio = await self.portfolio_repository.update(portfolio)
        
        logger.info(f"Portfolio updated successfully: {portfolio_id}")
        return await self._map_to_response(updated_portfolio)
    
    async def add_position(
        self,
        portfolio_id: UUID,
        user_id: UUID,
        request: AddPositionRequest,
    ) -> PortfolioResponse:
        """Add a position to portfolio."""
        logger.info(f"Adding position to portfolio {portfolio_id}")
        
        portfolio = await self.portfolio_repository.get_by_id(portfolio_id)
        if not portfolio:
            raise PortfolioNotFoundException(str(portfolio_id))
        
        # Check ownership
        if portfolio.user_id != user_id:
            raise PortfolioAccessDeniedException(str(portfolio_id), str(user_id))
        
        # Verify instrument exists
        instrument = await self.instrument_repository.get_by_id(request.instrument_id)
        if not instrument:
            raise EntityNotFoundException(f"Instrument {request.instrument_id} not found")
        
        # Create position
        position = PortfolioPosition.create(
            instrument_id=request.instrument_id,
            quantity=request.quantity,
            average_cost=request.average_cost,
        )
        
        # Add position to portfolio
        portfolio.add_position(position)
        
        # Save updated portfolio
        updated_portfolio = await self.portfolio_repository.update(portfolio)
        
        logger.info(f"Position added to portfolio: {portfolio_id}")
        return await self._map_to_response(updated_portfolio)
    
    async def update_position(
        self,
        portfolio_id: UUID,
        instrument_id: UUID,
        user_id: UUID,
        request: UpdatePositionRequest,
    ) -> PortfolioResponse:
        """Update a position in portfolio."""
        logger.info(f"Updating position {instrument_id} in portfolio {portfolio_id}")
        
        portfolio = await self.portfolio_repository.get_by_id(portfolio_id)
        if not portfolio:
            raise PortfolioNotFoundException(str(portfolio_id))
        
        # Check ownership
        if portfolio.user_id != user_id:
            raise PortfolioAccessDeniedException(str(portfolio_id), str(user_id))
        
        # Get position
        position = portfolio.get_position(instrument_id)
        if not position:
            raise PositionNotFoundException(str(instrument_id), str(portfolio_id))
        
        # Update position fields
        if request.quantity is not None:
            position.quantity = request.quantity
        if request.average_cost is not None:
            position.average_cost = request.average_cost
        
        # Save updated portfolio
        updated_portfolio = await self.portfolio_repository.update(portfolio)
        
        logger.info(f"Position updated in portfolio: {portfolio_id}")
        return await self._map_to_response(updated_portfolio)
    
    async def remove_position(
        self,
        portfolio_id: UUID,
        instrument_id: UUID,
        user_id: UUID,
    ) -> PortfolioResponse:
        """Remove a position from portfolio."""
        logger.info(f"Removing position {instrument_id} from portfolio {portfolio_id}")
        
        portfolio = await self.portfolio_repository.get_by_id(portfolio_id)
        if not portfolio:
            raise PortfolioNotFoundException(str(portfolio_id))
        
        # Check ownership
        if portfolio.user_id != user_id:
            raise PortfolioAccessDeniedException(str(portfolio_id), str(user_id))
        
        # Check if position exists
        if not portfolio.get_position(instrument_id):
            raise PositionNotFoundException(str(instrument_id), str(portfolio_id))
        
        # Remove position
        portfolio.remove_position(instrument_id)
        
        # Save updated portfolio
        updated_portfolio = await self.portfolio_repository.update(portfolio)
        
        logger.info(f"Position removed from portfolio: {portfolio_id}")
        return await self._map_to_response(updated_portfolio)
    
    async def delete_portfolio(self, portfolio_id: UUID, user_id: UUID) -> bool:
        """Delete a portfolio."""
        logger.info(f"Deleting portfolio {portfolio_id} for user {user_id}")
        
        portfolio = await self.portfolio_repository.get_by_id(portfolio_id)
        if not portfolio:
            raise PortfolioNotFoundException(str(portfolio_id))
        
        # Check ownership
        if portfolio.user_id != user_id:
            raise PortfolioAccessDeniedException(str(portfolio_id), str(user_id))
        
        # Delete portfolio
        deleted = await self.portfolio_repository.delete(portfolio_id)
        
        if deleted:
            logger.info(f"Portfolio deleted successfully: {portfolio_id}")
        
        return deleted
    
    async def _map_to_response(self, portfolio: Portfolio) -> PortfolioResponse:
        """Map Portfolio entity to PortfolioResponse DTO."""
        # Get instrument details for positions
        instrument_ids = [pos.instrument_id for pos in portfolio.positions]
        instruments = {}
        
        if instrument_ids:
            for instrument_id in instrument_ids:
                instrument = await self.instrument_repository.get_by_id(instrument_id)
                if instrument:
                    instruments[instrument_id] = instrument
            
            # Get latest prices
            latest_prices = await self.price_data_repository.get_latest_for_instruments(
                instrument_ids
            )
            price_map = {price.instrument_id: price.close_price for price in latest_prices}
            
            # Update portfolio with latest prices
            portfolio.update_prices(price_map)
        
        # Map positions
        position_responses = []
        for position in portfolio.positions:
            instrument = instruments.get(position.instrument_id)
            position_responses.append(PositionResponse(
                id=position.id,
                instrument_id=position.instrument_id,
                instrument_symbol=instrument.symbol if instrument else None,
                instrument_name=instrument.name if instrument else None,
                quantity=position.quantity,
                average_cost=position.average_cost,
                current_price=position.current_price,
                market_value=position.market_value,
                cost_basis=position.cost_basis,
                unrealized_pnl=position.unrealized_pnl,
                unrealized_pnl_percent=position.unrealized_pnl_percent,
                created_at=position.created_at,
                updated_at=position.updated_at,
            ))
        
        return PortfolioResponse(
            id=portfolio.id,
            user_id=portfolio.user_id,
            name=portfolio.name,
            description=portfolio.description,
            base_currency=portfolio.base_currency,
            positions=position_responses,
            total_market_value=portfolio.total_market_value,
            total_cost_basis=portfolio.total_cost_basis,
            total_unrealized_pnl=portfolio.total_unrealized_pnl,
            total_unrealized_pnl_percent=portfolio.total_unrealized_pnl_percent,
            is_active=portfolio.is_active,
            created_at=portfolio.created_at,
            updated_at=portfolio.updated_at,
        )
    
    def _map_to_summary_response(self, portfolio: Portfolio) -> PortfolioSummaryResponse:
        """Map Portfolio entity to PortfolioSummaryResponse DTO."""
        return PortfolioSummaryResponse(
            id=portfolio.id,
            name=portfolio.name,
            description=portfolio.description,
            base_currency=portfolio.base_currency,
            total_market_value=portfolio.total_market_value,
            total_cost_basis=portfolio.total_cost_basis,
            total_unrealized_pnl=portfolio.total_unrealized_pnl,
            total_unrealized_pnl_percent=portfolio.total_unrealized_pnl_percent,
            position_count=len(portfolio.positions),
            created_at=portfolio.created_at,
            updated_at=portfolio.updated_at,
        )