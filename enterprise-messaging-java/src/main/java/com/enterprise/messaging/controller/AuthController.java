package com.enterprise.messaging.controller;

import com.enterprise.messaging.domain.User;
import com.enterprise.messaging.domain.enums.UserRole;
import com.enterprise.messaging.dto.auth.LoginRequest;
import com.enterprise.messaging.dto.auth.LoginResponse;
import com.enterprise.messaging.dto.auth.RegisterRequest;
import com.enterprise.messaging.dto.auth.RegisterResponse;
import com.enterprise.messaging.exception.UserAlreadyExistsException;
import com.enterprise.messaging.security.JwtTokenProvider;
import com.enterprise.messaging.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Authentication and registration endpoints")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final UserService userService;
    private final JwtTokenProvider jwtTokenProvider;

    @Autowired
    public AuthController(AuthenticationManager authenticationManager,
                         UserService userService,
                         JwtTokenProvider jwtTokenProvider) {
        this.authenticationManager = authenticationManager;
        this.userService = userService;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @PostMapping("/register")
    @Operation(summary = "Register a new user")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        try {
            User user = new User(request.getUsername(), request.getEmail(), request.getPassword());
            user.setDisplayName(request.getDisplayName());
            user.setRole(UserRole.USER);

            User createdUser = userService.createUser(user);

            String token = jwtTokenProvider.generateToken(
                createdUser.getUsername(), 
                createdUser.getId().toString()
            );

            RegisterResponse response = new RegisterResponse(
                createdUser.getId(),
                createdUser.getUsername(),
                createdUser.getEmail(),
                createdUser.getDisplayName(),
                token
            );

            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (UserAlreadyExistsException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new RegisterResponse(e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new RegisterResponse("Registration failed"));
        }
    }

    @PostMapping("/login")
    @Operation(summary = "Authenticate user and return JWT token")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        try {
            Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                    request.getUsernameOrEmail(),
                    request.getPassword()
                )
            );

            User user = userService.findByUsernameOrEmail(request.getUsernameOrEmail())
                .orElseThrow(() -> new RuntimeException("User not found"));

            String token = jwtTokenProvider.generateToken(
                user.getUsername(),
                user.getId().toString()
            );

            // Update last seen and reset failed attempts
            userService.handleSuccessfulLogin(user.getId());

            LoginResponse response = new LoginResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole(),
                token
            );

            return ResponseEntity.ok(response);
        } catch (AuthenticationException e) {
            // Handle failed login attempt
            userService.handleFailedLogin(request.getUsernameOrEmail());
            
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new LoginResponse("Invalid credentials"));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new LoginResponse("Login failed"));
        }
    }

    @PostMapping("/logout")
    @Operation(summary = "Logout user")
    public ResponseEntity<String> logout() {
        // In a stateless JWT setup, logout is typically handled client-side
        // by removing the token. Server-side logout would require token blacklisting
        return ResponseEntity.ok("Logged out successfully");
    }

    @PostMapping("/refresh")
    @Operation(summary = "Refresh JWT token")
    public ResponseEntity<LoginResponse> refreshToken(@RequestHeader("Authorization") String token) {
        try {
            String jwtToken = token.replace("Bearer ", "");
            
            if (jwtTokenProvider.validateToken(jwtToken)) {
                String username = jwtTokenProvider.getUsernameFromToken(jwtToken);
                String userId = jwtTokenProvider.getUserIdFromToken(jwtToken);
                
                String newToken = jwtTokenProvider.generateToken(username, userId);
                
                User user = userService.findByUsername(username)
                    .orElseThrow(() -> new RuntimeException("User not found"));
                
                LoginResponse response = new LoginResponse(
                    user.getId(),
                    user.getUsername(),
                    user.getEmail(),
                    user.getDisplayName(),
                    user.getRole(),
                    newToken
                );
                
                return ResponseEntity.ok(response);
            } else {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new LoginResponse("Invalid token"));
            }
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new LoginResponse("Token refresh failed"));
        }
    }

    @PostMapping("/forgot-password")
    @Operation(summary = "Request password reset")
    public ResponseEntity<String> forgotPassword(@RequestParam String email) {
        try {
            userService.resetPassword(email);
            return ResponseEntity.ok("Password reset email sent");
        } catch (Exception e) {
            // Don't reveal if email exists or not for security
            return ResponseEntity.ok("If the email exists, a password reset link has been sent");
        }
    }
}