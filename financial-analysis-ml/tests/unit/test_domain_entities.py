"""Unit tests for domain entities."""
import pytest
from decimal import Decimal
from datetime import datetime
from uuid import uuid4

from src.domain.entities.user import User
from src.domain.entities.financial_instrument import FinancialInstrument, InstrumentType, Currency
from src.domain.entities.price_data import PriceData
from src.domain.entities.portfolio import Portfolio, PortfolioPosition
from src.domain.value_objects.email import Email
from src.domain.value_objects.password import Password
from src.domain.value_objects.money import Money


class TestUser:
    """Test User entity."""
    
    def test_create_user(self, sample_user_data):
        """Test user creation."""
        user = User.create(
            email=sample_user_data["email"],
            password=sample_user_data["password"],
            first_name=sample_user_data["first_name"],
            last_name=sample_user_data["last_name"],
        )
        
        assert user.id is not None
        assert str(user.email) == sample_user_data["email"]
        assert user.first_name == sample_user_data["first_name"]
        assert user.last_name == sample_user_data["last_name"]
        assert user.is_active is True
        assert user.is_verified is False
        assert user.created_at is not None
        assert user.updated_at is not None
    
    def test_user_full_name(self, sample_user_data):
        """Test user full name property."""
        user = User.create(**sample_user_data)
        expected_full_name = f"{sample_user_data['first_name']} {sample_user_data['last_name']}"
        assert user.full_name == expected_full_name
    
    def test_user_verification(self, sample_user_data):
        """Test user email verification."""
        user = User.create(**sample_user_data)
        assert user.is_verified is False
        
        user.verify_email()
        assert user.is_verified is True
    
    def test_user_deactivation(self, sample_user_data):
        """Test user deactivation."""
        user = User.create(**sample_user_data)
        assert user.is_active is True
        
        user.deactivate()
        assert user.is_active is False
    
    def test_user_profile_update(self, sample_user_data):
        """Test user profile update."""
        user = User.create(**sample_user_data)
        original_updated_at = user.updated_at
        
        new_first_name = "Jane"
        new_last_name = "Smith"
        
        user.update_profile(first_name=new_first_name, last_name=new_last_name)
        
        assert user.first_name == new_first_name
        assert user.last_name == new_last_name
        assert user.updated_at > original_updated_at


class TestFinancialInstrument:
    """Test FinancialInstrument entity."""
    
    def test_create_instrument(self, sample_instrument_data):
        """Test financial instrument creation."""
        instrument = FinancialInstrument.create(**sample_instrument_data)
        
        assert instrument.id is not None
        assert instrument.symbol == sample_instrument_data["symbol"]
        assert instrument.name == sample_instrument_data["name"]
        assert instrument.instrument_type == sample_instrument_data["instrument_type"]
        assert instrument.currency == sample_instrument_data["currency"]
        assert instrument.exchange == sample_instrument_data["exchange"]
        assert instrument.is_active is True
        assert instrument.created_at is not None
    
    def test_instrument_update_info(self, sample_instrument_data):
        """Test instrument information update."""
        instrument = FinancialInstrument.create(**sample_instrument_data)
        original_updated_at = instrument.updated_at
        
        new_name = "Apple Inc. (Updated)"
        new_description = "Updated description"
        
        instrument.update_info(name=new_name, description=new_description)
        
        assert instrument.name == new_name
        assert instrument.description == new_description
        assert instrument.updated_at > original_updated_at


class TestPriceData:
    """Test PriceData entity."""
    
    def test_create_price_data(self, sample_price_data):
        """Test price data creation."""
        instrument_id = uuid4()
        
        price_data = PriceData.create(
            instrument_id=instrument_id,
            **sample_price_data
        )
        
        assert price_data.id is not None
        assert price_data.instrument_id == instrument_id
        assert price_data.open_price == sample_price_data["open_price"]
        assert price_data.high_price == sample_price_data["high_price"]
        assert price_data.low_price == sample_price_data["low_price"]
        assert price_data.close_price == sample_price_data["close_price"]
        assert price_data.volume == sample_price_data["volume"]
    
    def test_price_data_calculations(self, sample_price_data):
        """Test price data calculation properties."""
        instrument_id = uuid4()
        price_data = PriceData.create(instrument_id=instrument_id, **sample_price_data)
        
        # Test price change
        expected_change = sample_price_data["close_price"] - sample_price_data["open_price"]
        assert price_data.price_change == expected_change
        
        # Test trading range
        expected_range = sample_price_data["high_price"] - sample_price_data["low_price"]
        assert price_data.trading_range == expected_range
        
        # Test up/down day
        assert price_data.is_up_day is True
        assert price_data.is_down_day is False
    
    def test_invalid_price_data(self):
        """Test validation of invalid price data."""
        instrument_id = uuid4()
        
        with pytest.raises(ValueError, match="Invalid price data"):
            PriceData.create(
                instrument_id=instrument_id,
                timestamp=datetime.now(),
                open_price=Decimal("100"),
                high_price=Decimal("90"),  # High less than open
                low_price=Decimal("95"),
                close_price=Decimal("98"),
                volume=1000,
            )
        
        with pytest.raises(ValueError, match="Volume cannot be negative"):
            PriceData.create(
                instrument_id=instrument_id,
                timestamp=datetime.now(),
                open_price=Decimal("100"),
                high_price=Decimal("105"),
                low_price=Decimal("95"),
                close_price=Decimal("98"),
                volume=-1000,
            )


class TestPortfolio:
    """Test Portfolio and PortfolioPosition entities."""
    
    def test_create_portfolio(self, sample_portfolio_data):
        """Test portfolio creation."""
        user_id = uuid4()
        
        portfolio = Portfolio.create(
            user_id=user_id,
            **sample_portfolio_data
        )
        
        assert portfolio.id is not None
        assert portfolio.user_id == user_id
        assert portfolio.name == sample_portfolio_data["name"]
        assert portfolio.description == sample_portfolio_data["description"]
        assert portfolio.base_currency == sample_portfolio_data["base_currency"]
        assert portfolio.is_active is True
        assert len(portfolio.positions) == 0
    
    def test_create_position(self):
        """Test portfolio position creation."""
        instrument_id = uuid4()
        quantity = Decimal("100")
        average_cost = Decimal("150.50")
        
        position = PortfolioPosition.create(
            instrument_id=instrument_id,
            quantity=quantity,
            average_cost=average_cost,
        )
        
        assert position.id is not None
        assert position.instrument_id == instrument_id
        assert position.quantity == quantity
        assert position.average_cost == average_cost
        assert position.cost_basis == quantity * average_cost
    
    def test_position_calculations(self):
        """Test portfolio position calculations."""
        instrument_id = uuid4()
        quantity = Decimal("100")
        average_cost = Decimal("150.00")
        current_price = Decimal("160.00")
        
        position = PortfolioPosition.create(
            instrument_id=instrument_id,
            quantity=quantity,
            average_cost=average_cost,
            current_price=current_price,
        )
        
        # Test market value
        expected_market_value = quantity * current_price
        assert position.market_value == expected_market_value
        
        # Test unrealized P&L
        expected_pnl = expected_market_value - position.cost_basis
        assert position.unrealized_pnl == expected_pnl
        
        # Test unrealized P&L percentage
        expected_pnl_percent = (expected_pnl / position.cost_basis) * 100
        assert position.unrealized_pnl_percent == expected_pnl_percent
    
    def test_add_position_to_portfolio(self, sample_portfolio_data):
        """Test adding position to portfolio."""
        user_id = uuid4()
        portfolio = Portfolio.create(user_id=user_id, **sample_portfolio_data)
        
        instrument_id = uuid4()
        position = PortfolioPosition.create(
            instrument_id=instrument_id,
            quantity=Decimal("100"),
            average_cost=Decimal("150.00"),
        )
        
        portfolio.add_position(position)
        
        assert len(portfolio.positions) == 1
        assert portfolio.positions[0] == position
        assert portfolio.total_cost_basis == position.cost_basis
    
    def test_portfolio_totals(self, sample_portfolio_data):
        """Test portfolio total calculations."""
        user_id = uuid4()
        portfolio = Portfolio.create(user_id=user_id, **sample_portfolio_data)
        
        # Add multiple positions
        for i in range(3):
            instrument_id = uuid4()
            position = PortfolioPosition.create(
                instrument_id=instrument_id,
                quantity=Decimal("100"),
                average_cost=Decimal(f"{150 + i}.00"),
                current_price=Decimal(f"{160 + i}.00"),
            )
            portfolio.add_position(position)
        
        # Test totals
        expected_cost_basis = sum(pos.cost_basis for pos in portfolio.positions)
        expected_market_value = sum(pos.market_value for pos in portfolio.positions)
        expected_pnl = expected_market_value - expected_cost_basis
        
        assert portfolio.total_cost_basis == expected_cost_basis
        assert portfolio.total_market_value == expected_market_value
        assert portfolio.total_unrealized_pnl == expected_pnl


class TestValueObjects:
    """Test value objects."""
    
    def test_email_validation(self):
        """Test email validation."""
        # Valid email
        email = Email("test@example.com")
        assert str(email) == "test@example.com"
        assert email.domain == "example.com"
        assert email.local_part == "test"
        
        # Invalid emails
        with pytest.raises(ValueError, match="Invalid email format"):
            Email("invalid-email")
        
        with pytest.raises(ValueError, match="Email cannot be empty"):
            Email("")
    
    def test_password_validation(self):
        """Test password validation."""
        # Valid password
        password = Password("TestPassword123!")
        assert password.value == "TestPassword123!"
        
        # Invalid passwords
        with pytest.raises(ValueError, match="Password must be at least 8 characters"):
            Password("short")
        
        with pytest.raises(ValueError, match="Password must contain"):
            Password("nouppercaseornumbers")
    
    def test_password_hashing(self):
        """Test password hashing and verification."""
        password = Password("TestPassword123!")
        hashed = password.hash()
        
        assert password.verify(hashed) is True
        
        # Test with wrong password
        wrong_password = Password("WrongPassword123!")
        assert wrong_password.verify(hashed) is False
    
    def test_money_operations(self):
        """Test money value object operations."""
        usd_100 = Money(Decimal("100.00"), Currency.USD)
        usd_50 = Money(Decimal("50.00"), Currency.USD)
        
        # Addition
        total = usd_100 + usd_50
        assert total.amount == Decimal("150.00")
        assert total.currency == Currency.USD
        
        # Subtraction
        difference = usd_100 - usd_50
        assert difference.amount == Decimal("50.00")
        
        # Multiplication
        doubled = usd_100 * 2
        assert doubled.amount == Decimal("200.00")
        
        # Division
        half = usd_100 / 2
        assert half.amount == Decimal("50.00")
        
        # Comparison
        assert usd_100 > usd_50
        assert usd_50 < usd_100
        assert usd_100 == Money(Decimal("100.00"), Currency.USD)
    
    def test_money_currency_mismatch(self):
        """Test money operations with different currencies."""
        usd_100 = Money(Decimal("100.00"), Currency.USD)
        eur_50 = Money(Decimal("50.00"), Currency.EUR)
        
        with pytest.raises(ValueError, match="Cannot add"):
            usd_100 + eur_50
        
        with pytest.raises(ValueError, match="Cannot subtract"):
            usd_100 - eur_50
        
        with pytest.raises(ValueError, match="Cannot compare"):
            usd_100 > eur_50