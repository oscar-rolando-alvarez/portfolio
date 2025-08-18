package com.enterprise.messaging.repository;

import com.enterprise.messaging.domain.Group;
import com.enterprise.messaging.domain.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GroupRepository extends JpaRepository<Group, UUID> {

    Optional<Group> findByName(String name);

    List<Group> findByIsPrivate(Boolean isPrivate);

    @Query("SELECT g FROM Group g WHERE g.isPrivate = false")
    List<Group> findPublicGroups();

    @Query("SELECT g FROM Group g JOIN g.members m WHERE m.id = :userId")
    List<Group> findUserGroups(@Param("userId") UUID userId);

    @Query("SELECT g FROM Group g JOIN g.admins a WHERE a.id = :userId")
    List<Group> findGroupsAdministeredBy(@Param("userId") UUID userId);

    @Query("SELECT g FROM Group g WHERE g.createdBy.id = :userId")
    List<Group> findGroupsCreatedBy(@Param("userId") UUID userId);

    @Query("SELECT g FROM Group g WHERE " +
           "LOWER(g.name) LIKE LOWER(CONCAT('%', :searchTerm, '%')) OR " +
           "LOWER(g.description) LIKE LOWER(CONCAT('%', :searchTerm, '%'))")
    Page<Group> searchGroups(@Param("searchTerm") String searchTerm, Pageable pageable);

    @Query("SELECT g FROM Group g WHERE " +
           "g.isPrivate = false AND " +
           "(LOWER(g.name) LIKE LOWER(CONCAT('%', :searchTerm, '%')) OR " +
           "LOWER(g.description) LIKE LOWER(CONCAT('%', :searchTerm, '%')))")
    Page<Group> searchPublicGroups(@Param("searchTerm") String searchTerm, Pageable pageable);

    @Query("SELECT COUNT(m) FROM Group g JOIN g.members m WHERE g.id = :groupId")
    long countGroupMembers(@Param("groupId") UUID groupId);

    @Query("SELECT g FROM Group g WHERE SIZE(g.members) < :maxMembers")
    List<Group> findGroupsWithAvailableSpace(@Param("maxMembers") int maxMembers);

    @Query("SELECT g FROM Group g JOIN g.members m WHERE m = :user")
    List<Group> findUserGroupsByUser(@Param("user") User user);

    boolean existsByName(String name);

    @Query("SELECT g FROM Group g WHERE g.maxMembers IS NULL OR SIZE(g.members) < g.maxMembers")
    List<Group> findGroupsAcceptingMembers();
}