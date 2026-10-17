package com.enterprise.messaging.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * Activates {@code @CreatedDate}/{@code @LastModifiedDate} population for {@code BaseEntity}.
 */
@Configuration
@EnableJpaAuditing
public class JpaAuditingConfig {}
