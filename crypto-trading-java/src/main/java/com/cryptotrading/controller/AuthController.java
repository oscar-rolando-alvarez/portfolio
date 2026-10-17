package com.cryptotrading.controller;

import com.cryptotrading.controller.dto.AuthDtos.LoginRequest;
import com.cryptotrading.controller.dto.AuthDtos.RegisterRequest;
import com.cryptotrading.controller.dto.AuthDtos.TokenResponse;
import com.cryptotrading.controller.dto.AuthDtos.UserResponse;
import com.cryptotrading.domain.entity.User;
import com.cryptotrading.security.JwtTokenProvider;
import com.cryptotrading.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Registration and JWT login endpoints.
 */
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Auth", description = "Registration and token issuance")
public class AuthController {

    private final UserService userService;
    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider jwtTokenProvider;

    @PostMapping("/register")
    @Operation(summary = "Register a new user")
    public ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest request) {
        User user = new User();
        user.setUsername(request.username());
        user.setEmail(request.email());
        user.setPassword(request.password());
        User saved = userService.createUser(user);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new UserResponse(saved.getId(), saved.getUsername(), saved.getEmail()));
    }

    @PostMapping("/login")
    @Operation(summary = "Exchange credentials for a JWT")
    public TokenResponse login(@Valid @RequestBody LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.username(), request.password()));
        UserDetails principal = (UserDetails) authentication.getPrincipal();
        userService.handleSuccessfulLogin(principal.getUsername());
        return TokenResponse.bearer(
                jwtTokenProvider.generateToken(principal), jwtTokenProvider.generateRefreshToken(principal));
    }
}
